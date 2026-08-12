import { api } from './http.js';
import type { IDataObject } from '@n8n-clone/workflow';
import type { ICredentialRecord } from './types.js';

export interface ICreateCredentialPayload {
  name: string;
  type: string;
  data: IDataObject;
}

export const credentialsApi = {
  list: (): Promise<ICredentialRecord[]> => api.get('/credentials'),
  get: (id: string): Promise<ICredentialRecord> => api.get(`/credentials/${id}`),
  create: (payload: ICreateCredentialPayload): Promise<ICredentialRecord> => api.post('/credentials', payload),
  update: (id: string, payload: Partial<ICreateCredentialPayload>): Promise<ICredentialRecord> =>
    api.patch(`/credentials/${id}`, payload),
  remove: (id: string): Promise<void> => api.delete(`/credentials/${id}`),
};
