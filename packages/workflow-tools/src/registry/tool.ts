import type { INodeTypes } from '@runnel/core';
import type { z } from 'zod';
import type { ICredentialRepositoryPort } from '../draft/credential-repository.port.js';
import type { IWorkflowExecutorPort } from '../draft/execution.port.js';
import type { WorkflowDraftStore } from '../draft/workflow-draft.store.js';

/** Everything a tool handler is allowed to touch — never the raw repository, never anything outside the current draft. `credentials`/`executor` are optional: a caller that never wires one simply can't use the tools that need it, and gets a clear error instead of a crash if it tries. */
export interface IToolContext {
  draftId: string;
  nodeTypes: INodeTypes;
  draftStore: WorkflowDraftStore;
  credentials?: ICredentialRepositoryPort;
  /** Grounding's execution seam (execute_dry_run/execute_live/get_node_output) — see IWorkflowExecutorPort. */
  executor?: IWorkflowExecutorPort;
}

/**
 * A tool handler should be a five-line wrapper (build-prompt rule #3: "if a tool handler
 * contains business logic, it's in the wrong place"). All the actual graph-mutation logic lives
 * in @runnel/core's mutation module; a handler here does nothing but read the draft, call
 * into core, and write the result back.
 */
export interface ITool<TParams, TResult> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  handler: (params: TParams, ctx: IToolContext) => TResult | Promise<TResult>;
  /** True for a tool whose effect must not be applied without explicit user sign-off first (Part 5's approval gates: remove_node, rename_node). The agent loop (packages/assistant) pauses instead of invoking the handler when this is set. */
  requiresApproval?: boolean;
}

/** Type-erases a tool for storage in a registry map — invokeTool restores the connection between validated params and the handler that expects them via the parse step itself, so this is safe. */
export type AnyTool = ITool<unknown, unknown>;
