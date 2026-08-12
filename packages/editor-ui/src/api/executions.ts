import { api } from './http.js';
import type { IExecutionRecord } from './types.js';

export const executionsApi = {
  list: (workflowId?: string): Promise<IExecutionRecord[]> =>
    api.get(workflowId ? `/executions?workflowId=${encodeURIComponent(workflowId)}` : '/executions'),
  get: (id: string): Promise<IExecutionRecord> => api.get(`/executions/${id}`),
};
