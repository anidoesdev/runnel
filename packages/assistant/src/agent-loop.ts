import { invokeTool, redactDeep, ToolError } from '@runnel/workflow-tools';
import { ASK_USER_TOOL_DEFINITION, ASK_USER_TOOL_NAME, parseAskUserArguments } from './ask-user.js';
import { SYSTEM_PROMPT } from './prompts/load-system-prompt.js';
import { toModelToolDefinitions } from './tool-definitions.js';
import type { AnyTool, IToolContext, IToolErrorInfo } from '@runnel/workflow-tools';
import type { IModelMessage, IModelProvider, IModelToolCallRef, IModelToolDefinition } from './model-provider.js';
import type { IAskUserQuestion, IAssistantSession } from './session.js';

export type AgentLoopStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_call_budget_exceeded'
  | 'token_budget_exceeded'
  | 'wall_clock_exceeded'
  | 'aborted'
  | 'provider_error'
  | 'awaiting_approval'
  | 'awaiting_user';

export type AgentLoopEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'tool_error'; id: string; name: string; error: IToolErrorInfo }
  | { type: 'approval_required'; id: string; name: string; args: unknown }
  | { type: 'ask_user_required'; id: string; questions: IAskUserQuestion[] }
  | { type: 'turn_complete'; stopReason: AgentLoopStopReason };

export interface IRunTurnDeps {
  modelProvider: IModelProvider;
  tools: ReadonlyMap<string, AnyTool>;
  toolContext: IToolContext;
  systemPrompt?: string;
}

export interface IRunTurnOptions {
  signal?: AbortSignal;
  /** Part 5's "~40 tool calls per turn" budget — counts calls actually executed, not requested. Resets on every runTurn/resumeApproval/resumeAskUser call: a human approval pause is a deliberate checkpoint, not the runaway-loop scenario this budget protects against. */
  maxToolCalls?: number;
  /** Wall-clock budget for one runTurn/resumeApproval/resumeAskUser call — likewise restarts on resume, so a human taking ten minutes to approve something doesn't eat into it. */
  wallClockMs?: number;
  /** For live UI streaming (Milestone 5) — entirely optional. */
  onEvent?: (event: AgentLoopEvent) => void;
}

const DEFAULT_MAX_TOOL_CALLS = 40;
const DEFAULT_WALL_CLOCK_MS = 120_000;

interface IPendingToolCall {
  id: string;
  name: string;
  argsText: string;
}

interface ILoopBudget {
  used: number;
  max: number;
}

type BatchOutcome = { kind: 'completed' } | { kind: 'suspended' } | { kind: 'aborted' } | { kind: 'budget_exceeded' };

function parseToolArguments(argsText: string): unknown {
  if (argsText.length === 0) return {};
  try {
    return JSON.parse(argsText);
  } catch {
    // Malformed JSON becomes an empty object, not a thrown error — invokeTool's own Zod
    // validation then rejects it as INVALID_ARGS with a message the model can act on.
    return {};
  }
}

function toToolErrorInfo(err: unknown): IToolErrorInfo {
  return err instanceof ToolError
    ? err.toToolResult()
    : { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err), retryable: false };
}

function buildModelTools(tools: ReadonlyMap<string, AnyTool>): IModelToolDefinition[] {
  return [...toModelToolDefinitions(tools.values()), ASK_USER_TOOL_DEFINITION];
}

/** One model round-trip: streams the response, accumulates text/tool-call deltas, pushes the resulting assistant message (unless aborted mid-stream, matching how a dangling partial response is discarded rather than recorded), and reports what the model wants next. */
async function runOneModelCall(
  session: IAssistantSession,
  deps: IRunTurnDeps,
  options: IRunTurnOptions,
  modelTools: IModelToolDefinition[],
  systemPrompt: string,
): Promise<{ toolCalls: IModelToolCallRef[]; stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted' }> {
  const pendingCalls = new Map<string, IPendingToolCall>();
  const callOrder: string[] = [];
  let assistantText = '';
  let modelStopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted' = 'end_turn';

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

  const toolCalls: IModelToolCallRef[] = callOrder.map((id) => {
    const call = pendingCalls.get(id)!;
    return { id: call.id, name: call.name, arguments: call.argsText };
  });

  if (modelStopReason !== 'aborted') {
    const assistantMessage: IModelMessage = { role: 'assistant', content: assistantText };
    if (toolCalls.length > 0) assistantMessage.toolCalls = toolCalls;
    session.messages.push(assistantMessage);
  }

  return { toolCalls, stopReason: modelStopReason };
}

/**
 * Executes a batch of tool calls in order, stopping (without throwing) the moment one needs
 * human input: an ask_user call, or a call to a tool with `requiresApproval`. The suspended
 * call's session.pendingApproval/pendingQuestions records everything needed to resume later —
 * including the calls after it in this same batch, which resumeApproval/resumeAskUser process
 * once the pause is resolved, so a multi-call turn never silently drops work that came after
 * the gated call.
 */
async function processToolCallBatch(
  session: IAssistantSession,
  calls: IModelToolCallRef[],
  deps: IRunTurnDeps,
  options: IRunTurnOptions,
  budget: ILoopBudget,
): Promise<BatchOutcome> {
  for (let i = 0; i < calls.length; i++) {
    const call = calls[i]!;

    if (options.signal?.aborted) return { kind: 'aborted' };

    if (call.name === ASK_USER_TOOL_NAME) {
      const questions = parseAskUserArguments(call.arguments);
      if (!questions) {
        const invalidArgsError: IToolErrorInfo = {
          code: 'INVALID_ARGS',
          message: 'ask_user arguments did not match the expected shape: { questions: [{ id, question, options?, allowFreeText? }, ...] }.',
          retryable: true,
        };
        session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(invalidArgsError) });
        options.onEvent?.({ type: 'tool_error', id: call.id, name: call.name, error: invalidArgsError });
        continue;
      }
      session.status = 'awaiting_user';
      session.pendingQuestions = { toolCallId: call.id, questions, remainingCalls: calls.slice(i + 1) };
      options.onEvent?.({ type: 'ask_user_required', id: call.id, questions });
      return { kind: 'suspended' };
    }

    const tool = deps.tools.get(call.name);
    if (tool?.requiresApproval) {
      const args = parseToolArguments(call.arguments);
      session.status = 'awaiting_approval';
      session.pendingApproval = { toolCallId: call.id, toolName: call.name, args, remainingCalls: calls.slice(i + 1) };
      options.onEvent?.({ type: 'approval_required', id: call.id, name: call.name, args });
      return { kind: 'suspended' };
    }

    if (budget.used >= budget.max) {
      for (let j = i; j < calls.length; j++) {
        const remaining = calls[j]!;
        const budgetError: IToolErrorInfo = {
          code: 'INTERNAL',
          message: `This turn's ${budget.max}-tool-call budget is exhausted.`,
          retryable: false,
        };
        session.messages.push({ role: 'tool', toolCallId: remaining.id, content: JSON.stringify(budgetError) });
        options.onEvent?.({ type: 'tool_error', id: remaining.id, name: remaining.name, error: budgetError });
      }
      return { kind: 'budget_exceeded' };
    }
    budget.used++;

    const args = parseToolArguments(call.arguments);
    options.onEvent?.({ type: 'tool_call', id: call.id, name: call.name, args });

    try {
      const rawResult = await invokeTool(deps.tools, call.name, args, deps.toolContext);
      const result = redactDeep(rawResult);
      session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(result) });
      options.onEvent?.({ type: 'tool_result', id: call.id, name: call.name, result });
    } catch (err) {
      const toolError = toToolErrorInfo(err);
      session.messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(toolError) });
      options.onEvent?.({ type: 'tool_error', id: call.id, name: call.name, error: toolError });
    }
  }
  return { kind: 'completed' };
}

async function continueAfterBatch(
  session: IAssistantSession,
  outcome: BatchOutcome,
  deps: IRunTurnDeps,
  options: IRunTurnOptions,
  budget: ILoopBudget,
  deadline: number,
): Promise<AgentLoopStopReason> {
  switch (outcome.kind) {
    case 'suspended':
      return session.status === 'awaiting_user' ? 'awaiting_user' : 'awaiting_approval';
    case 'aborted':
      return 'aborted';
    case 'budget_exceeded':
      return 'tool_call_budget_exceeded';
    case 'completed':
      return driveLoop(session, deps, options, budget, deadline);
  }
}

/** One model round-trip plus whatever it asks for — recurses (via continueAfterBatch) as long as the model keeps calling tools it doesn't need a human for. */
async function driveLoop(
  session: IAssistantSession,
  deps: IRunTurnDeps,
  options: IRunTurnOptions,
  budget: ILoopBudget,
  deadline: number,
): Promise<AgentLoopStopReason> {
  if (options.signal?.aborted) return 'aborted';
  if (Date.now() > deadline) return 'wall_clock_exceeded';
  if (session.tokenBudget.used >= session.tokenBudget.limit) return 'token_budget_exceeded';

  const modelTools = buildModelTools(deps.tools);
  const systemPrompt = deps.systemPrompt ?? SYSTEM_PROMPT;

  let modelResult;
  try {
    modelResult = await runOneModelCall(session, deps, options, modelTools, systemPrompt);
  } catch (err) {
    session.status = 'error';
    session.updatedAt = new Date().toISOString();
    throw err instanceof Error ? err : new Error(String(err));
  }

  if (modelResult.stopReason === 'aborted') return 'aborted';
  if (modelResult.stopReason !== 'tool_use') return modelResult.stopReason === 'max_tokens' ? 'max_tokens' : 'end_turn';

  const outcome = await processToolCallBatch(session, modelResult.toolCalls, deps, options, budget);
  return continueAfterBatch(session, outcome, deps, options, budget, deadline);
}

function finalize(session: IAssistantSession, stopReason: AgentLoopStopReason, options: IRunTurnOptions): void {
  if (stopReason !== 'awaiting_approval' && stopReason !== 'awaiting_user') {
    session.status = 'idle';
  }
  session.updatedAt = new Date().toISOString();
  options.onEvent?.({ type: 'turn_complete', stopReason });
}

/**
 * The agent loop: one call handles a full user turn, which may span many tool calls across
 * several model round-trips before the model produces a final text-only answer, or pauses on
 * an ask_user question / an approval-gated tool (resumeAskUser / resumeApproval continue from
 * there). Mutates and returns `session` — the caller owns persisting it (see
 * IAssistantSessionRepositoryPort in session.ts); this function never touches storage.
 */
export async function runTurn(
  session: IAssistantSession,
  userMessage: string,
  deps: IRunTurnDeps,
  options: IRunTurnOptions = {},
): Promise<IAssistantSession> {
  session.messages.push({ role: 'user', content: userMessage });
  session.status = 'thinking';

  const budget: ILoopBudget = { used: 0, max: options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS };
  const deadline = Date.now() + (options.wallClockMs ?? DEFAULT_WALL_CLOCK_MS);

  const stopReason = await driveLoop(session, deps, options, budget, deadline);
  finalize(session, stopReason, options);
  return session;
}

/** Resolves a paused approval gate (remove_node/rename_node) and continues the turn. `session.status` must be 'awaiting_approval'. Rejecting doesn't throw or crash the turn — it feeds the model a clear "not approved" tool result and lets it react. */
export async function resumeApproval(
  session: IAssistantSession,
  decision: 'approve' | 'reject',
  deps: IRunTurnDeps,
  options: IRunTurnOptions = {},
): Promise<IAssistantSession> {
  if (session.status !== 'awaiting_approval' || !session.pendingApproval) {
    throw new Error('resumeApproval called without a pending approval on this session.');
  }
  const pending = session.pendingApproval;
  session.pendingApproval = undefined;
  session.status = 'thinking';

  if (decision === 'approve') {
    try {
      const rawResult = await invokeTool(deps.tools, pending.toolName, pending.args, deps.toolContext);
      const result = redactDeep(rawResult);
      session.messages.push({ role: 'tool', toolCallId: pending.toolCallId, content: JSON.stringify(result) });
      options.onEvent?.({ type: 'tool_result', id: pending.toolCallId, name: pending.toolName, result });
    } catch (err) {
      const toolError = toToolErrorInfo(err);
      session.messages.push({ role: 'tool', toolCallId: pending.toolCallId, content: JSON.stringify(toolError) });
      options.onEvent?.({ type: 'tool_error', id: pending.toolCallId, name: pending.toolName, error: toolError });
    }
  } else {
    const rejection = { rejected: true, message: 'The user did not approve this action.' };
    session.messages.push({ role: 'tool', toolCallId: pending.toolCallId, content: JSON.stringify(rejection) });
    options.onEvent?.({ type: 'tool_result', id: pending.toolCallId, name: pending.toolName, result: rejection });
  }

  const budget: ILoopBudget = { used: 0, max: options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS };
  const deadline = Date.now() + (options.wallClockMs ?? DEFAULT_WALL_CLOCK_MS);

  const outcome = await processToolCallBatch(session, pending.remainingCalls, deps, options, budget);
  const stopReason = await continueAfterBatch(session, outcome, deps, options, budget, deadline);
  finalize(session, stopReason, options);
  return session;
}

/** Resolves a paused ask_user call with the user's answers (keyed by question id) and continues the turn. `session.status` must be 'awaiting_user'; every question must have an answer. */
export async function resumeAskUser(
  session: IAssistantSession,
  answers: Record<string, string>,
  deps: IRunTurnDeps,
  options: IRunTurnOptions = {},
): Promise<IAssistantSession> {
  if (session.status !== 'awaiting_user' || !session.pendingQuestions) {
    throw new Error('resumeAskUser called without pending questions on this session.');
  }
  const pending = session.pendingQuestions;
  const missing = pending.questions.filter((question) => !(question.id in answers));
  if (missing.length > 0) {
    throw new Error(`Missing answers for question id(s): ${missing.map((question) => question.id).join(', ')}.`);
  }

  session.pendingQuestions = undefined;
  session.status = 'thinking';
  session.messages.push({ role: 'tool', toolCallId: pending.toolCallId, content: JSON.stringify(answers) });
  options.onEvent?.({ type: 'tool_result', id: pending.toolCallId, name: ASK_USER_TOOL_NAME, result: answers });

  const budget: ILoopBudget = { used: 0, max: options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS };
  const deadline = Date.now() + (options.wallClockMs ?? DEFAULT_WALL_CLOCK_MS);

  const outcome = await processToolCallBatch(session, pending.remainingCalls, deps, options, budget);
  const stopReason = await continueAfterBatch(session, outcome, deps, options, budget, deadline);
  finalize(session, stopReason, options);
  return session;
}
