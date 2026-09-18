import { api } from './http.js';
import type { IConnections, IDataObject, INode, IWorkflowSettings } from '@n8n-clone/workflow';
import type { IExecuteWorkflowResult, IWorkflowRecord } from './types.js';

export interface IWorkflowPayload {
  name: string;
  active?: boolean;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings | null;
  starred?: boolean;
  folderId?: string | null;
}

/** Mirrors listWorkflowsQuerySchema in packages/cli — 'all' excludes the trash, 'trash' shows only it. */
export interface IWorkflowListQuery {
  view?: 'all' | 'starred' | 'trash';
  folderId?: string;
}

export const workflowsApi = {
  list: (query: IWorkflowListQuery = {}): Promise<IWorkflowRecord[]> => {
    const params = new URLSearchParams();
    if (query.view && query.view !== 'all') params.set('view', query.view);
    if (query.folderId) params.set('folderId', query.folderId);
    const search = params.toString();
    return api.get(`/workflows${search ? `?${search}` : ''}`);
  },
  get: (id: string): Promise<IWorkflowRecord> => api.get(`/workflows/${id}`),
  create: (payload: IWorkflowPayload): Promise<IWorkflowRecord> => api.post('/workflows', payload),
  update: (id: string, payload: Partial<IWorkflowPayload>): Promise<IWorkflowRecord> => api.patch(`/workflows/${id}`, payload),
  /** Soft delete: the workflow moves to the trash and stays restorable (see trash.ts on the server). */
  remove: (id: string): Promise<void> => api.delete(`/workflows/${id}`),
  restore: (id: string): Promise<IWorkflowRecord> => api.post(`/workflows/${id}/restore`),
  removePermanently: (id: string): Promise<void> => api.delete(`/workflows/${id}/permanent`),
  execute: (id: string, data?: IDataObject[], destinationNode?: string, startNodeName?: string): Promise<IExecuteWorkflowResult> =>
    api.post(`/workflows/${id}/execute`, { data, destinationNode, startNodeName }),
};
