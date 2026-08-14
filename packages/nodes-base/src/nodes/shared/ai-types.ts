import type { IDataObject } from '@n8n-clone/workflow';

/** Shared by the AI Agent node and every `ai_languageModel`/`ai_tool` sub-node it can be wired to. */

export interface IChatToolCall {
  id: string;
  name: string;
  /** Raw JSON string, exactly as the model returned it — the caller decides how/when to parse it. */
  arguments: string;
}

export interface IChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Set on a 'tool' message: which tool call this is the result of. */
  toolCallId?: string;
  /** Set on an 'assistant' message that chose to call tools instead of answering. */
  toolCalls?: IChatToolCall[];
}

/** What an `ai_tool` node's execute()-time schema looks like to the model — JSON Schema, same shape OpenAI's function-calling `parameters` expects. */
export interface IToolSchema {
  name: string;
  description: string;
  parameters: IDataObject;
}

/** supplyData() result for an `ai_languageModel` node (e.g. OpenAI Chat Model). */
export interface IChatModel {
  chat(messages: IChatMessage[], tools: IToolSchema[]): Promise<{ content: string | null; toolCalls: IChatToolCall[] }>;
}

/** supplyData() result for an `ai_tool` node (e.g. Calculator Tool). */
export interface IAiTool {
  name: string;
  description: string;
  schema: IDataObject;
  invoke(args: IDataObject): Promise<string>;
}
