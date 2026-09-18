import { api } from './http.js';
import type { IFolderRecord } from './types.js';

export const foldersApi = {
  list: (): Promise<IFolderRecord[]> => api.get('/folders'),
  create: (name: string): Promise<IFolderRecord> => api.post('/folders', { name }),
  rename: (id: string, name: string): Promise<IFolderRecord> => api.patch(`/folders/${id}`, { name }),
  /** Deletes the folder only — its workflows survive and become unfiled. */
  remove: (id: string): Promise<void> => api.delete(`/folders/${id}`),
};
