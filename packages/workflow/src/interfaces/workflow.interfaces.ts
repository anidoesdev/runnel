import type { IDataObject, INodeExecutionData } from './common.interfaces.js';
import type { INode, NodeConnectionType } from './node.interfaces.js';

export interface IConnection {
  node: string;
  type: NodeConnectionType;
  index: number;
}

/**
 * Keyed by connection type per source node. `main` carries the regular data flow and is what
 * the execution engine's queue/topological order is built from. Non-`main` types (e.g.
 * `ai_languageModel`, `ai_tool`) are "sub-node" connections: a node offering one (an LLM
 * client, a callable tool) is never scheduled through the main queue — it has no `main`
 * connection to be reached by — and is instead resolved on demand by the consuming node
 * (see IExecuteFunctions.getInputConnectionData) when it runs.
 */
export type IConnections = Record<string, Partial<Record<NodeConnectionType, IConnection[][]>>>;

export interface IWorkflowSettings {
  timezone?: string;
  errorWorkflow?: string;
  saveDataOnSuccess?: 'all' | 'none';
  saveDataOnError?: 'all' | 'none';
  saveExecutionProgress?: boolean;
  executionOrder?: 'v0' | 'v1';
}

export interface IWorkflowBase {
  id: string;
  name: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings;
  staticData?: IDataObject;
  pinData?: Record<string, INodeExecutionData[]>;
}
