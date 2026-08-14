import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowStore } from './workflow.store.js';
import { workflowsApi } from '../api/workflows.js';
import type { IWorkflowRecord } from '../api/types.js';

vi.mock('../api/workflows.js', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    execute: vi.fn(),
  },
}));

describe('workflow store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('addNode assigns a unique name and marks the workflow dirty', () => {
    const store = useWorkflowStore();
    const first = store.addNode('set', 'Edit Fields', [0, 0]);
    const second = store.addNode('set', 'Edit Fields', [100, 0]);

    expect(first.name).toBe('Edit Fields');
    expect(second.name).toBe('Edit Fields 2');
    expect(store.dirty).toBe(true);
  });

  it('moveNode updates the node position', () => {
    const store = useWorkflowStore();
    const node = store.addNode('noOp', 'Done', [0, 0]);
    store.moveNode(node.id, [50, 60]);
    expect(store.nodes.find((n) => n.id === node.id)?.position).toEqual([50, 60]);
  });

  it('removeNode deletes the node and any connections that reference it', () => {
    const store = useWorkflowStore();
    const a = store.addNode('manualTrigger', 'Trigger', [0, 0]);
    const b = store.addNode('noOp', 'Done', [100, 0]);
    store.addConnection('Trigger', 'Done');

    store.removeNode(b.id);
    expect(store.nodes.map((n) => n.id)).toEqual([a.id]);
    expect(store.connections.Trigger?.main[0]).toEqual([]);
  });

  it('renameNode updates both the node and any connections referencing its old name', () => {
    const store = useWorkflowStore();
    const trigger = store.addNode('manualTrigger', 'Trigger', [0, 0]);
    store.addNode('noOp', 'Done', [100, 0]);
    store.addConnection('Trigger', 'Done');

    store.renameNode(trigger.id, 'Start Here');
    expect(store.nodes.find((n) => n.id === trigger.id)?.name).toBe('Start Here');
    expect(store.connections['Start Here']?.main[0]).toEqual([{ node: 'Done', type: 'main', index: 0 }]);
    expect(store.connections.Trigger).toBeUndefined();
  });

  it('addConnection is idempotent and removeConnection removes exactly the matching edge', () => {
    const store = useWorkflowStore();
    store.addNode('manualTrigger', 'Trigger', [0, 0]);
    store.addNode('noOp', 'Done', [100, 0]);

    store.addConnection('Trigger', 'Done');
    store.addConnection('Trigger', 'Done');
    expect(store.connections.Trigger?.main[0]).toHaveLength(1);

    store.removeConnection('Trigger', 'Done', 0, 0);
    expect(store.connections.Trigger?.main[0]).toEqual([]);
  });

  it('updateNodeParameters sets a node\'s parameters and marks dirty', () => {
    const store = useWorkflowStore();
    const node = store.addNode('set', 'Edit Fields', [0, 0]);
    store.updateNodeParameters(node.id, { mode: 'json' });
    expect(store.nodes.find((n) => n.id === node.id)?.parameters).toEqual({ mode: 'json' });
  });

  it('setNodeCredential assigns and clears a node\'s credential for a given type', () => {
    const store = useWorkflowStore();
    const node = store.addNode('httpRequest', 'HTTP Request', [0, 0]);

    store.setNodeCredential(node.id, 'httpBasicAuth', { id: 'c1', name: 'My Auth' });
    expect(store.nodes.find((n) => n.id === node.id)?.credentials).toEqual({ httpBasicAuth: { id: 'c1', name: 'My Auth' } });

    store.setNodeCredential(node.id, 'httpBasicAuth', null);
    expect(store.nodes.find((n) => n.id === node.id)?.credentials).toEqual({});
  });

  it('save creates a new workflow when it has no id, then applies the returned record', async () => {
    const created: IWorkflowRecord = {
      id: 'wf-1',
      name: 'My workflow',
      active: false,
      nodes: [],
      connections: {},
      settings: null,
      staticData: null,
      pinData: null,
      createdAt: 't',
      updatedAt: 't',
    };
    vi.mocked(workflowsApi.create).mockResolvedValue(created);
    const store = useWorkflowStore();

    await store.save();
    expect(workflowsApi.create).toHaveBeenCalled();
    expect(workflowsApi.update).not.toHaveBeenCalled();
    expect(store.id).toBe('wf-1');
    expect(store.dirty).toBe(false);
  });

  it('save updates an existing workflow when it already has an id', async () => {
    const record: IWorkflowRecord = {
      id: 'wf-1',
      name: 'Renamed',
      active: false,
      nodes: [],
      connections: {},
      settings: null,
      staticData: null,
      pinData: null,
      createdAt: 't',
      updatedAt: 't',
    };
    vi.mocked(workflowsApi.update).mockResolvedValue(record);
    const store = useWorkflowStore();
    store.applyRecord({ ...record, name: 'Original' });

    await store.save();
    expect(workflowsApi.update).toHaveBeenCalledWith('wf-1', expect.objectContaining({ name: 'Original' }));
    expect(store.name).toBe('Renamed');
  });

  it('execute throws when the workflow has never been saved', async () => {
    const store = useWorkflowStore();
    await expect(store.execute()).rejects.toThrow(/Save the workflow/);
  });

  it('execute stores the result on success', async () => {
    const result = { executionId: 'e1', status: 'success' as const, data: { resultData: { runData: {} } } };
    vi.mocked(workflowsApi.execute).mockResolvedValue(result);
    const store = useWorkflowStore();
    store.id = 'wf-1';

    await store.execute();
    expect(store.lastResult).toEqual(result);
    expect(store.executing).toBe(false);
  });

  it('execute forwards an optional destinationNode to the API ("run to here")', async () => {
    const result = { executionId: 'e1', status: 'success' as const, data: { resultData: { runData: {} } } };
    vi.mocked(workflowsApi.execute).mockResolvedValue(result);
    const store = useWorkflowStore();
    store.id = 'wf-1';

    await store.execute('Edit Fields');
    expect(workflowsApi.execute).toHaveBeenCalledWith('wf-1', undefined, 'Edit Fields');
  });
});
