import type { INodeExecutionData } from './common.interfaces.js';
import type { ITaskData, WorkflowExecuteMode } from './execution.interfaces.js';
import type { INode } from './node.interfaces.js';
import type { IWorkflowBase } from './workflow.interfaces.js';

export interface IExpressionEvalContext {
  item: INodeExecutionData;
  itemIndex: number;
  runIndex: number;
  node: INode;
  workflow: IWorkflowBase;
  runData: Record<string, ITaskData[]>;
  mode: WorkflowExecuteMode;
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
