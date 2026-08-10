import type { IDataObject, INodeExecutionData } from './common.interfaces.js';
import type { ITaskData, WorkflowExecuteMode } from './execution.interfaces.js';
import type { INode } from './node.interfaces.js';
import type { IWorkflowBase } from './workflow.interfaces.js';

/**
 * Everything the expression evaluator needs is passed in by the host (packages/core, or the
 * editor for live-preview) rather than read internally — env vars, secrets, and instance
 * variables are all Node/backend concerns, and this interface must stay resolvable from a
 * browser-safe evaluator with no `process`, no filesystem, and no network access of its own.
 */
export interface IExpressionEvalContext {
  item: INodeExecutionData;
  itemIndex: number;
  runIndex: number;
  node: INode;
  workflow: IWorkflowBase;
  runData: Record<string, ITaskData[]>;
  mode: WorkflowExecuteMode;
  /** The full input array feeding the current node (backs `$input.all()/.first()/.last()/.item`). */
  inputItems: INodeExecutionData[];
  /** Sibling parameter values on this node, for `$parameter`. */
  parameters?: IDataObject;
  /** Environment variables injected by the host, for `$env`. Never read from `process.env` here. */
  env?: Record<string, string>;
  /** Whether `$env` access should be blocked (N8N_BLOCK_ENV_ACCESS_IN_NODE, decided by the host). */
  blockEnvAccess?: boolean;
  /** Instance variables, for `$vars`. */
  vars?: IDataObject;
  /** External secret-store values, for `$secrets`. */
  secrets?: IDataObject;
  execution?: { id: string; resumeUrl?: string };
  prevNode?: { name: string; outputIndex: number; runIndex: number };
}

/**
 * Single source of truth for the expression scope: the runtime evaluator and the
 * CodeMirror autocomplete source are both generated from a list of these, so the two
 * surfaces cannot drift apart.
 */
export interface IExpressionScopeDefinition {
  key: string;
  kind: 'value' | 'function' | 'namespace';
  description: string;
  resolve: (ctx: IExpressionEvalContext) => unknown;
}
