import { invokeTool, ToolError } from '@n8n-clone/workflow-tools';
import { SYSTEM_PROMPT } from './prompts/load-system-prompt.js';
import { toModelToolDefinitions } from './tool-definitions.js';
import type { AnyTool, IToolContext, IToolErrorInfo } from '@n8n-clone/workflow-tools';
import type { IModelMessage, IModelProvider, IModelToolCallRef } from './model-provider.js';
import type { IAssistantSession } from './session.js';

export type AgentLoopStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_call_budget_exceeded'
  | 'token_budget_exceeded'
  | 'wall_clock_exceeded'
  | 'aborted'
  | 'provider_error';

export type AgentLoopEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'tool_error'; id: string; name: string; error: IToolErrorInfo }
  | { type: 'turn_complete'; stopReason: AgentLoopStopReason };

export interface IRunTurnDeps {
  modelProvider: IModelProvider;
  tools: ReadonlyMap<string, AnyTool>;
  toolContext: IToolContext;
  systemPrompt?: string;
}

export interface IRunTurnOptions {
  signal?: AbortSignal;
  /** Part 5's "~40 tool calls per turn" budget — counts calls actually executed, not requested. */
  maxToolCalls?: number;
  /** Wall-clock budget for the whole turn (every model round-trip plus every tool call), not per model call. */
  wallClockMs?: number;
  /** For live UI streaming (Milestone 5) — entirely optional; the loop is fully usable without it, as the Milestone 3 test does. */
  onEvent?: (event: AgentLoopEvent) => void;
}

const DEFAULT_MAX_TOOL_CALLS = 40;
const DEFAULT_WALL_CLOCK_MS = 120_000;

interface IPendingToolCall {
  id: string;
  name: string;
  argsText: string;
}

function parseToolArguments(argsText: string): unknown {
  if (argsText.length === 0) return {};
  try {
    return JSON.parse(argsText);
  } catch {
    // Malformed JSON from the model becomes an empty object, not a thrown error — invokeTool's
    // own Zod validation then rejects it as INVALID_ARGS with a message the model can act on,
    // exactly like any other bad-arguments case, rather than crashing the whole turn.
    return {};
  }
}

/**
 * The agent loop: one call handles a full user turn, which may span many tool calls across
 * several model round-trips (build skeleton, configure, attach credentials, ...) before the
 * model produces a final text-only answer. Mutates and returns `session` — the caller owns
 * persisting it (see IAssistantSessionRepositoryPort in session.ts); this function never
 * touches storage, so it's exactly as testable with a fake ModelProvider as without one.
 */
export async function runTurn(
  session: IAssistantSession,
  userMessage: string,
  deps: IRunTurnDeps,
  options: IRunTurnOptions = {},
): Promise<IAssistantSession> {
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS;
  const deadline = Date.now() + (options.wallClockMs ?? DEFAULT_WALL_CLOCK_MS);
  const modelTools = toModelToolDefinitions(deps.tools.values());
  const systemPrompt = deps.systemPrompt ?? SYSTEM_PROMPT;

  session.messages.push({ role: 'user', content: userMessage });
  session.status = 'thinking';

  let toolCallsUsed = 0;
  let stopReason: AgentLoopStopReason = 'end_turn';

  turnLoop: for (;;) {
    if (options.signal?.aborted) {
      stopReason = 'aborted';
      break;
    }
    if (Date.now() > deadline) {
      stopReason = 'wall_clock_exceeded';
      break;
    }
    if (session.tokenBudget.used >= session.tokenBudget.limit) {
      stopReason = 'token_budget_exceeded';
      break;
    }

    const pendingCalls = new Map<string, IPendingToolCall>();
    const callOrder: string[] = [];
    let assistantText = '';
    let modelStopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted' = 'end_turn';

    try {
      for await (const event of deps.modelProvider.stream(session.messages, modelTools, systemPrompt, { signal: options.signal })) {
        switch (event.type) {
          case 'text_delta':
            assistantText += event.text;
            options.onEvent?.({ type: 'text_delta', text: event.text });
            break;
          case 'tool_use_start':
            pendingCalls.set(event.id, { id: event.id, name: event.name, argsText: '' });
            callOrder.push(event.id);
            break;
          case 'tool_use_delta': {
            const call = pendingCalls.get(event.id);
            if (call) call.argsText += event.argumentsDelta;
            break;
          }
          case 'tool_use_end':
            break;
          case 'usage':
            session.tokenBudget.used += event.inputTokens + event.outputTokens;
            break;
          case 'message_stop':
            modelStopReason = event.stopReason;
            break;
        }
      }
    } catch (err) {
      stopReason = 'provider_error';
      session.status = 'error';
      session.updatedAt = new Date().toISOString();
      options.onEvent?.({ type: 'turn_complete', stopReason });
      throw err instanceof Error ? err : new Error(String(err));
    }

    if (modelStopReason === 'aborted') {
      stopReason = 'aborted';
      break;
    }

    const toolCalls: IModelToolCallRef[] = callOrder.map((id) => {
      const call = pendingCalls.get(id)!;
      return { id: call.id, name: call.name, arguments: call.argsText };
    });

    const assistantMessage: IModelMessage = { role: 'assistant', content: assistantText };
    if (toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;
    session.messages.push(assistantMessage);

    if (modelStopReason !== 'tool_use') {
      stopReason = modelStopReason === 'max_tokens' ? 'max_tokens' : 'end_turn';
      break;
    }

    for (const id of callOrder) {
      const call = pendingCalls.get(id)!;

      if (options.signal?.aborted) {
        stopReason = 'aborted';
        break turnLoop;
      }

      if (toolCallsUsed >= maxToolCalls) {
        const budgetError: IToolErrorInfo = {
          code: 'INTERNAL',
          message: `This turn's ${maxToolCalls}-tool-call budget is exhausted.`,
          retryable: false,
        };
        session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(budgetError) });
        options.onEvent?.({ type: 'tool_error', id: call.id, name: call.name, error: budgetError });
        stopReason = 'tool_call_budget_exceeded';
        continue;
      }
      toolCallsUsed++;

      const args = parseToolArguments(call.argsText);
      options.onEvent?.({ type: 'tool_call', id: call.id, name: call.name, args });

      try {
        const result = await invokeTool(deps.tools, call.name, args, deps.toolContext);
        session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
        options.onEvent?.({ type: 'tool_result', id: call.id, name: call.name, result });
      } catch (err) {
        const toolError: IToolErrorInfo = err instanceof ToolError
          ? err.toToolResult()
          : { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err), retryable: false };
        session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(toolError) });
        options.onEvent?.({ type: 'tool_error', id: call.id, name: call.name, error: toolError });
      }
    }

    if (stopReason === 'tool_call_budget_exceeded') break;
    // Otherwise loop again: the next model call sees the tool results just appended.
  }

  session.status = 'idle';
  session.updatedAt = new Date().toISOString();
  options.onEvent?.({ type: 'turn_complete', stopReason });
  return session;
}
