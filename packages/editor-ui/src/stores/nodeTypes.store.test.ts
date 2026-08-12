import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodeTypesStore } from './nodeTypes.store.js';
import { credentialTypesApi, nodeTypesApi } from '../api/nodeTypes.js';
import type { ICredentialType, INodeTypeDescription } from '@n8n-clone/workflow';

vi.mock('../api/nodeTypes.js', () => ({
  nodeTypesApi: { list: vi.fn() },
  credentialTypesApi: { list: vi.fn() },
}));

const setNodeType = {
  displayName: 'Edit Fields (Set)',
  name: 'set',
  group: ['transform'],
  version: 1,
  description: 'Sets fields',
  defaults: { name: 'Edit Fields' },
  inputs: ['main'],
  outputs: ['main'],
  properties: [],
} satisfies INodeTypeDescription;

const basicAuth = {
  name: 'httpBasicAuth',
  displayName: 'Basic Auth',
  properties: [],
} satisfies ICredentialType;

describe('nodeTypes store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('load fetches both node types and credential types once', async () => {
    vi.mocked(nodeTypesApi.list).mockResolvedValue([setNodeType]);
    vi.mocked(credentialTypesApi.list).mockResolvedValue([basicAuth]);
    const store = useNodeTypesStore();

    await store.load();
    await store.load();

    expect(nodeTypesApi.list).toHaveBeenCalledTimes(1);
    expect(store.nodeTypes).toEqual([setNodeType]);
    expect(store.credentialTypes).toEqual([basicAuth]);
  });

  it('byName / credentialTypeByName look up by declared name', async () => {
    vi.mocked(nodeTypesApi.list).mockResolvedValue([setNodeType]);
    vi.mocked(credentialTypesApi.list).mockResolvedValue([basicAuth]);
    const store = useNodeTypesStore();
    await store.load();

    expect(store.byName('set')).toEqual(setNodeType);
    expect(store.byName('nope')).toBeUndefined();
    expect(store.credentialTypeByName('httpBasicAuth')).toEqual(basicAuth);
  });
});
