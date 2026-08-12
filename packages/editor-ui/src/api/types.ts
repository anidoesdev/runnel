import type { ExecutionStatus, IConnections, IDataObject, INode, IRunExecutionData, IWorkflowSettings, WorkflowExecuteMode } from '@n8n-clone/workflow';

/** WorkflowEntity as it comes back over the REST API — IWorkflowBase's fields plus the row's own timestamps. */
export interface IWorkflowRecord {
  id: string;
  name: string;
  active: boolean;
  nodes: INode[];
  connections: IConnections;
  settings: IWorkflowSettings | null;
  staticData: IDataObject | null;
  pinData: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ICredentialRecord {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface IExecutionRecord {
  id: string;
  workflowId: string;
  mode: WorkflowExecuteMode;
  status: ExecutionStatus;
  startedAt: string;
  stoppedAt: string | null;
  data: IRunExecutionData;
}

export interface IExecuteWorkflowResult {
  executionId: string;
  status: 'success' | 'error';
  data: IRunExecutionData;
}

export interface IAuthUser {
  id: string;
  email: string;
}

export interface IMeResponse extends IAuthUser {
  isOwner: boolean;
}
