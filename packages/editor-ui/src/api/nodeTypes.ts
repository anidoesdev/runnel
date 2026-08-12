import { api } from './http.js';
import type { ICredentialType, INodeTypeDescription } from '@n8n-clone/workflow';

export const nodeTypesApi = {
  list: (): Promise<INodeTypeDescription[]> => api.get('/node-types'),
};

export const credentialTypesApi = {
  list: (): Promise<ICredentialType[]> => api.get('/credential-types'),
};
