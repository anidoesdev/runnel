import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCredentialsStore } from './credentials.store.js';
import { credentialsApi } from '../api/credentials.js';

vi.mock('../api/credentials.js', () => ({
  credentialsApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const record = { id: 'c1', name: 'My Cred', type: 'httpBasicAuth', createdAt: 't', updatedAt: 't' };

describe('credentials store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('load fetches once and caches unless forced', async () => {
    vi.mocked(credentialsApi.list).mockResolvedValue([record]);
    const store = useCredentialsStore();

    await store.load();
    await store.load();
    expect(credentialsApi.list).toHaveBeenCalledTimes(1);
    expect(store.credentials).toEqual([record]);

    await store.load(true);
    expect(credentialsApi.list).toHaveBeenCalledTimes(2);
  });

  it('create appends the new credential', async () => {
    vi.mocked(credentialsApi.create).mockResolvedValue(record);
    const store = useCredentialsStore();

    const created = await store.create({ name: 'My Cred', type: 'httpBasicAuth', data: {} });
    expect(created).toEqual(record);
    expect(store.credentials).toEqual([record]);
  });

  it('remove drops the credential from state', async () => {
    vi.mocked(credentialsApi.remove).mockResolvedValue(undefined);
    const store = useCredentialsStore();
    store.credentials = [record];

    await store.remove('c1');
    expect(store.credentials).toEqual([]);
  });

  it('byType filters credentials by their declared credential type', async () => {
    const store = useCredentialsStore();
    store.credentials = [record, { ...record, id: 'c2', type: 'httpHeaderAuth' }];

    expect(store.byType('httpBasicAuth')).toEqual([record]);
  });
});
