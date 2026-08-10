import type { NodeOutput } from './common.interfaces.js';
import type { INode } from './node.interfaces.js';

export type ExecutionStatus =
  | 'new'
  | 'running'
  | 'success'
  | 'error'
  | 'crashed'
  | 'waiting'
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

export interface ITaskData {
  startTime: number;
  executionTime: number;
  executionStatus: ExecutionStatus;
  source: Array<ISourceData | null>;
  data?: { main: NodeOutput };
  error?: { message: string; description?: string; node: string; timestamp: number };
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
    pinData?: Record<string, unknown>;
    lastNodeExecuted?: string;
    error?: { message: string; node?: string; timestamp: number };
  };
  executionData?: {
    contextData: Record<string, unknown>;
    nodeExecutionStack: IExecuteData[];
    waitingExecution: Record<string, Record<number, NodeOutput>>;
    waitingExecutionSource: Record<string, Record<string, Array<{ previousNode: string } | null> | null>> | null;
  };
  /** ISO date string, never a Date instance, to stay serialization-safe. */
  waitTill?: string;
}
