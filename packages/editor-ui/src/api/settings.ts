import { api } from './http.js';
import type { ISystemInfo, IUserPreferences } from './types.js';

export const settingsApi = {
  system: (): Promise<ISystemInfo> => api.get('/settings/system'),
  preferences: (): Promise<IUserPreferences> => api.get('/settings/preferences'),
  /** Merged per section on the server, so sending one section leaves the rest alone. */
  updatePreferences: (preferences: IUserPreferences): Promise<IUserPreferences> => api.patch('/settings/preferences', preferences),
  changePassword: (currentPassword: string, newPassword: string): Promise<{ id: string; email: string }> =>
    api.post('/auth/password', { currentPassword, newPassword }),
};
