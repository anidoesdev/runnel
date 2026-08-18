export interface IModelToolCallRef {
  id: string;
  name: string;
  /** Raw JSON string, exactly as the model returned it — same convention as ai-types.ts's IChatToolCall in nodes-base. */
  arguments: string;
}

export interface IModelMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on a 'tool' message: which tool call this is the result of. */
  toolCallId?: string;
  /** Set on an 'assistant' message that chose to call tools instead of answering directly. */
  toolCalls?: IModelToolCallRef[];
}

export interface IModelToolDefinition {
  name: string;
  description: string;
  /** JSON Schema, the same shape OpenAI/Anthropic tool-calling `parameters`/`input_schema` expects. */
  parameters: unknown;
}

export type ModelStopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted';

/**
 * The event stream every ModelProvider implementation normalizes to, regardless of the
 * underlying API's own wire format (OpenAI's chunked `delta.tool_calls[].index`-keyed streaming
 * vs Anthropic's `content_block_start`/`_delta`/`_stop` — both collapse to this same shape). The
 * agent loop (session.ts) only ever depends on this union, never on a specific provider's types.
 */
export type ModelStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; argumentsDelta: string }
  | { type: 'tool_use_end'; id: string }
  | { type: 'message_stop'; stopReason: ModelStopReason }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

export interface IModelStreamOptions {
  signal?: AbortSignal;
}

/**
 * Behind this interface per the build prompt's MODEL section: default to one real
 * implementation (OpenAI, per the reuse-existing-credential-path decision — see
 * openai-model-provider.ts) and do not build a second provider before the first works end to
 * end. The agent loop depends only on this interface, so a local model or Anthropic can be
 * swapped in later without touching session.ts.
 */
export interface IModelProvider {
  stream(
    messages: IModelMessage[],
    tools: IModelToolDefinition[],
    system: string,
    options?: IModelStreamOptions,
  ): AsyncIterable<ModelStreamEvent>;
}
