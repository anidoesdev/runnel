import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from './auth.store.js';
import { authApi } from '../api/auth.js';

vi.mock('../api/auth.js', () => ({
  authApi: {
    setupStatus: vi.fn(),
    setup: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    me: vi.fn(),
  },
}));

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('checkSetupStatus stores the result', async () => {
    vi.mocked(authApi.setupStatus).mockResolvedValue({ completed: true });
    const store = useAuthStore();

    expect(await store.checkSetupStatus()).toBe(true);
    expect(store.setupCompleted).toBe(true);
  });

  it('fetchCurrentUser sets user and isAuthenticated on success', async () => {
    vi.mocked(authApi.me).mockResolvedValue({ id: 'u1', email: 'a@example.com', isOwner: true });
    const store = useAuthStore();

    expect(await store.fetchCurrentUser()).toBe(true);
    expect(store.isAuthenticated).toBe(true);
    expect(store.initialized).toBe(true);
  });

  it('fetchCurrentUser clears user and returns false on a 401', async () => {
    vi.mocked(authApi.me).mockRejectedValue(new Error('401'));
    const store = useAuthStore();
    store.user = { id: 'stale', email: 'x@example.com', isOwner: false };

    expect(await store.fetchCurrentUser()).toBe(false);
    expect(store.user).toBeNull();
    expect(store.isAuthenticated).toBe(false);
  });

  it('logout clears the current user', async () => {
    vi.mocked(authApi.logout).mockResolvedValue(undefined);
    const store = useAuthStore();
    store.user = { id: 'u1', email: 'a@example.com', isOwner: true };

    await store.logout();
    expect(store.user).toBeNull();
  });
});
