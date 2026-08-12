import { api } from './http.js';
import type { IAuthUser, IMeResponse } from './types.js';

export const authApi = {
  setupStatus: (): Promise<{ completed: boolean }> => api.get('/auth/setup'),
  setup: (email: string, password: string): Promise<IAuthUser> => api.post('/auth/setup', { email, password }),
  login: (email: string, password: string): Promise<IAuthUser> => api.post('/auth/login', { email, password }),
  logout: (): Promise<void> => api.post('/auth/logout'),
  me: (): Promise<IMeResponse> => api.get('/auth/me'),
};
