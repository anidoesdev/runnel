import type { INodeExecutionData, NodeOutput } from './common.interfaces.js';
import type { INode } from './node.interfaces.js';

export type ExecutionStatus =
  | 'new'
  | 'running'
  | 'success'
  | 'error'
  | 'crashed'
  | 'waiting'
  | 'skipped'
  | 'canceled';

export type WorkflowExecuteMode =
  | 'manual'
  | 'trigger'
  | 'webhook'
  | 'retry'
  | 'integrated'
  | 'cli';

export interface ISourceData {
  previousNode: string;
  previousNodeOutput?: number;
  previousNodeRun?: number;
}

export interface ITaskDataError {
  message: string;
  description?: string;
  node: string;
  timestamp: number;
}

export interface ITaskData {
  startTime: number;
  executionTime: number;
  executionStatus: ExecutionStatus;
  source: Array<ISourceData | null>;
  data?: { main: NodeOutput };
  error?: ITaskDataError;
}

/**
 * Everything under IRunExecutionData must survive a JSON round trip: no class instances,
 * no functions, no Date objects (use ISO strings), no streams. This is what makes the Wait
 * node, crash recovery, and the queue-mode main/worker handoff possible.
 */
export interface IExecuteData {
  node: INode;
  data: { main: NodeOutput };
  source: { main: Array<ISourceData | null> } | null;
}

export interface IRunExecutionData {
  startData?: { startNodes?: string[]; destinationNode?: string };
  resultData: {
    runData: Record<string, ITaskData[]>;
    pinData?: Record<string, INodeExecutionData[]>;
    lastNodeExecuted?: string;
    error?: ITaskDataError;
  };
  executionData?: {
    contextData: Record<string, unknown>;
    nodeExecutionStack: IExecuteData[];
    /** Partial inputs collected for a node with multiple inputs, keyed by target node name then input index, until every required index has arrived. */
    waitingExecution: Record<string, Record<number, INodeExecutionData[]>>;
    waitingExecutionSource: Record<string, Record<number, ISourceData | null>>;
  };
  /** ISO date string, never a Date instance, to stay serialization-safe. */
  waitTill?: string;
}
