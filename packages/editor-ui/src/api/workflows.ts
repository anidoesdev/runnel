import { api } from './http.js';
import type { IConnections, IDataObject, INode, IWorkflowSettings } from '@n8n-clone/workflow';
import type { IExecuteWorkflowResult, IWorkflowRecord } from './types.js';

export interface IWorkflowPayload {
  name: string;
  active?: boolean;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings | null;
}

export const workflowsApi = {
  list: (): Promise<IWorkflowRecord[]> => api.get('/workflows'),
  get: (id: string): Promise<IWorkflowRecord> => api.get(`/workflows/${id}`),
  create: (payload: IWorkflowPayload): Promise<IWorkflowRecord> => api.post('/workflows', payload),
  update: (id: string, payload: Partial<IWorkflowPayload>): Promise<IWorkflowRecord> => api.patch(`/workflows/${id}`, payload),
  remove: (id: string): Promise<void> => api.delete(`/workflows/${id}`),
  execute: (id: string, data?: IDataObject[], destinationNode?: string, startNodeName?: string): Promise<IExecuteWorkflowResult> =>
    api.post(`/workflows/${id}/execute`, { data, destinationNode, startNodeName }),
};
