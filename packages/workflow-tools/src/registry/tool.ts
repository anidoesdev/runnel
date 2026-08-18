import type { INodeTypes } from '@n8n-clone/core';
import type { z } from 'zod';
import type { WorkflowDraftStore } from '../draft/workflow-draft.store.js';

/** Everything a tool handler is allowed to touch — never the raw repository, never anything outside the current draft. */
export interface IToolContext {
  draftId: string;
  nodeTypes: INodeTypes;
  draftStore: WorkflowDraftStore;
}

/**
 * A tool handler should be a five-line wrapper (build-prompt rule #3: "if a tool handler
 * contains business logic, it's in the wrong place"). All the actual graph-mutation logic lives
 * in @n8n-clone/core's mutation module; a handler here does nothing but read the draft, call
 * into core, and write the result back.
 */
export interface ITool<TParams, TResult> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams, ctx: IToolContext) => TResult | Promise<TResult>;
}

/** Type-erases a tool for storage in a registry map — invokeTool restores the connection between validated params and the handler that expects them via the parse step itself, so this is safe. */
export type AnyTool = ITool<unknown, unknown>;
