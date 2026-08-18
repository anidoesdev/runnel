import { describe, expect, it } from 'vitest';
import { WorkflowDraftStore } from './workflow-draft.store.js';
import type { IWorkflowBase } from '@n8n-clone/workflow';
import type { IWorkflowRepositoryPort } from './workflow-repository.port.js';

function fakeRepository(initial: Record<string, IWorkflowBase>): IWorkflowRepositoryPort & { saved: Record<string, IWorkflowBase> } {
  const saved: Record<string, IWorkflowBase> = {};
  return {
    saved,
    async get(workflowId) {
      const workflow = initial[workflowId];
      if (!workflow) throw new Error(`fixture has no workflow "${workflowId}"`);
      return structuredClone(workflow);
    },
    async save(workflowId, workflow) {
      saved[workflowId] = structuredClone(workflow);
      return saved[workflowId]!;
    },
  };
}

function workflow(nodes: IWorkflowBase['nodes'] = [], connections: IWorkflowBase['connections'] = {}): IWorkflowBase {
  return { id: 'wf-1', name: 'Test', active: false, nodes, connections };
}

describe('WorkflowDraftStore', () => {
  it('open() snapshots the live workflow into both baseline and current', async () => {
    const repo = fakeRepository({ 'wf-1': workflow([{ id: '1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }]) });
    const store = new WorkflowDraftStore(repo);

    const draft = await store.open('wf-1');
    expect(draft.baseline.nodes).toHaveLength(1);
    expect(draft.current.nodes).toHaveLength(1);
    expect(draft.baseline).not.toBe(draft.current);
  });

  it('mutate() only changes current, never baseline', async () => {
    const repo = fakeRepository({ 'wf-1': workflow() });
    const store = new WorkflowDraftStore(repo);
    const draft = await store.open('wf-1');

    store.mutate(draft.id, (wf) => ({ ...wf, nodes: [{ id: '1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }] }));

    expect(store.get(draft.id).current.nodes).toHaveLength(1);
    expect(store.get(draft.id).baseline.nodes).toHaveLength(0);
  });

  it('get() throws DRAFT_NOT_FOUND for an unknown or already-closed draft', async () => {
    const repo = fakeRepository({ 'wf-1': workflow() });
    const store = new WorkflowDraftStore(repo);
    expect(() => store.get('nope')).toThrow(/No open draft/);
  });

  it('apply() persists current to the repository and forgets the draft', async () => {
    const repo = fakeRepository({ 'wf-1': workflow() });
    const store = new WorkflowDraftStore(repo);
    const draft = await store.open('wf-1');
    store.mutate(draft.id, (wf) => ({ ...wf, nodes: [{ id: '1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }] }));

    const saved = await store.apply(draft.id);

    expect(saved.nodes).toHaveLength(1);
    expect(repo.saved['wf-1']!.nodes).toHaveLength(1);
    expect(() => store.get(draft.id)).toThrow(/No open draft/);
  });

  it('discard() drops the draft without touching the repository', async () => {
    const repo = fakeRepository({ 'wf-1': workflow() });
    const store = new WorkflowDraftStore(repo);
    const draft = await store.open('wf-1');
    store.mutate(draft.id, (wf) => ({ ...wf, nodes: [{ id: '1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }] }));

    store.discard(draft.id);

    expect(repo.saved['wf-1']).toBeUndefined();
    expect(() => store.get(draft.id)).toThrow(/No open draft/);
  });

  it('diff() reports added/removed/changed nodes and added/removed connections', async () => {
    const repo = fakeRepository({
      'wf-1': workflow(
        [
          { id: '1', name: 'Keep', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: { a: 1 } },
          { id: '2', name: 'Gone', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} },
        ],
        { Keep: { main: [[{ node: 'Gone', type: 'main', index: 0 }]] } },
      ),
    });
    const store = new WorkflowDraftStore(repo);
    const draft = await store.open('wf-1');

    store.mutate(draft.id, (wf) => ({
      ...wf,
      nodes: [
        { id: '1', name: 'Keep', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: { a: 2 } },
        { id: '3', name: 'New', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} },
      ],
      connections: { Keep: { main: [[{ node: 'New', type: 'main', index: 0 }]] } },
    }));

    const diff = store.diff(draft.id);

    expect(diff.addedNodes).toEqual([{ name: 'New', type: 'noOp' }]);
    expect(diff.removedNodes).toEqual([{ name: 'Gone', type: 'noOp' }]);
    expect(diff.changedNodes).toEqual([{ name: 'Keep', before: { a: 1 }, after: { a: 2 } }]);
    expect(diff.addedConnections).toEqual([{ from: 'Keep', outputIndex: 0, to: 'New', inputIndex: 0, type: 'main' }]);
    expect(diff.removedConnections).toEqual([{ from: 'Keep', outputIndex: 0, to: 'Gone', inputIndex: 0, type: 'main' }]);
  });
});
