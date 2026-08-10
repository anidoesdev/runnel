import type { IDataObject, INodeExecutionData } from './common.interfaces.js';
import type { INode } from './node.interfaces.js';

export interface IConnection {
  node: string;
  type: 'main';
  index: number;
}

export type IConnections = Record<string, { main: IConnection[][] }>;

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
