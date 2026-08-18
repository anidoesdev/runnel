import { parseSseDataLines } from './sse.js';
import type { IModelMessage, IModelProvider, IModelStreamOptions, IModelToolDefinition, ModelStopReason, ModelStreamEvent } from '../model-provider.js';

export interface IOpenAiModelProviderConfig {
  apiKey: string;
  /** Overridable per the same "any OpenAI-compatible endpoint" contract packages/nodes-base's openAiApi credential already uses (Azure OpenAI, a local server, ...). */
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

interface IOpenAiToolCallDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

interface IOpenAiChunk {
  choices?: Array<{
    delta?: { content?: string | null; tool_calls?: IOpenAiToolCallDelta[] };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function toApiMessage(message: IModelMessage): Record<string, unknown> {
  return {
    role: message.role,
    content: message.content,
    ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
    ...(message.toolCalls
      ? {
          tool_calls: message.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        }
      : {}),
  };
}

function toApiTool(tool: IModelToolDefinition): Record<string, unknown> {
  return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } };
}

function toStopReason(finishReason: string | null | undefined): ModelStopReason | undefined {
  switch (finishReason) {
    case 'stop':
      return 'end_turn';
    case 'tool_calls':
      return 'tool_use';
    case 'length':
      return 'max_tokens';
    default:
      return undefined;
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Talks to any OpenAI-compatible chat-completions endpoint with `stream: true`, normalizing
 * OpenAI's index-keyed tool_calls streaming (the model can interleave deltas for several
 * parallel tool calls; only the *first* chunk for a given index carries its `id`/`function.name`
 * — every later chunk for that index carries only an `arguments` fragment) into the
 * provider-agnostic ModelStreamEvent union the agent loop depends on.
 */
export class OpenAiModelProvider implements IModelProvider {
  constructor(private readonly config: IOpenAiModelProviderConfig) {}

  async *stream(
    messages: IModelMessage[],
    tools: IModelToolDefinition[],
    system: string,
    options: IModelStreamOptions = {},
  ): AsyncGenerator<ModelStreamEvent> {
    try {
      yield* this.streamUnsafe(messages, tools, system, options);
    } catch (err) {
      if (isAbortError(err)) {
        yield { type: 'message_stop', stopReason: 'aborted' };
        return;
      }
      throw err;
    }
  }

  private async *streamUnsafe(
    messages: IModelMessage[],
    tools: IModelToolDefinition[],
    system: string,
    options: IModelStreamOptions,
  ): AsyncGenerator<ModelStreamEvent> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.apiKey}`, 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        model: this.config.model ?? 'gpt-4o-mini',
        temperature: this.config.temperature ?? 0.7,
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: 'system', content: system }, ...messages.map(toApiMessage)],
        ...(tools.length > 0 ? { tools: tools.map(toApiTool) } : {}),
      }),
    });

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(`OpenAI request failed (${response.status}): ${detail || response.statusText}`);
    }

    // index -> the id OpenAI assigned that tool call, so later argument-only deltas (which carry
    // only `index`, never `id`) can still be attributed to the right tool_use_delta event.
    const toolCallIdByIndex = new Map<number, string>();
    let stopReason: ModelStopReason = 'end_turn';

    for await (const data of parseSseDataLines(response.body)) {
      const chunk = JSON.parse(data) as IOpenAiChunk;

      if (chunk.usage) {
        yield { type: 'usage', inputTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      }

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      if (choice.delta?.content) {
        yield { type: 'text_delta', text: choice.delta.content };
      }

      for (const toolCall of choice.delta?.tool_calls ?? []) {
        if (toolCall.id && toolCall.function?.name) {
          toolCallIdByIndex.set(toolCall.index, toolCall.id);
          yield { type: 'tool_use_start', id: toolCall.id, name: toolCall.function.name };
        }
        if (toolCall.function?.arguments) {
          const id = toolCallIdByIndex.get(toolCall.index);
          if (id) yield { type: 'tool_use_delta', id, argumentsDelta: toolCall.function.arguments };
        }
      }

      const resolved = toStopReason(choice.finish_reason);
      if (resolved) stopReason = resolved;
    }

    for (const id of toolCallIdByIndex.values()) yield { type: 'tool_use_end', id };
    yield { type: 'message_stop', stopReason };
  }
}
