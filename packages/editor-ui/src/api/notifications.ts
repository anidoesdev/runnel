import { api } from './http.js';
import type { INotificationFeed } from './types.js';

export const notificationsApi = {
  feed: (): Promise<INotificationFeed> => api.get('/notifications'),
  markAllRead: (): Promise<void> => api.post('/notifications/read'),
  clear: (): Promise<void> => api.delete('/notifications'),
};
