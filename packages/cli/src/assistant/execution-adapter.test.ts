import { createServer } from 'node:http';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { registerAllCredentialTypes, registerAllNodeTypes } from '@n8n-clone/nodes-base';
import { WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { ExecutionAdapter } from './execution-adapter.js';
import { WorkflowRepositoryAdapter } from './workflow-repository.adapter.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DataSource, Repository } from 'typeorm';
import type { INode } from '@n8n-clone/workflow';

/**
 * Exercises ExecutionAdapter (grounding's execution seam) against a real local HTTP server and
 * real SQLite-backed workflow/credential repositories — proving the actual safety property
 * (a write is never really sent during a dry run) and the actual grounding value (a GET's real
 * response shape becomes get_node_output's schema/sample), not just the mocking mechanics
 * already covered by workflow-execute.test.ts's engine-level unit tests.
 */

let requestCount = 0;
let server: Server;
let serverUrl: string;

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    requestCount++;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ method: req.method, path: req.url, hello: 'world' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const triggerNode: INode = { id: 'n1', name: 'Manual Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };

function httpNode(name: string, method: 'GET' | 'POST'): INode {
  return { id: `n-${name}`, name, type: 'httpRequest', typeVersion: 1, position: [260, 0], parameters: { url: serverUrl, method } };
}

describe('ExecutionAdapter', () => {
  let dataSource: DataSource;
  let workflows: Repository<WorkflowEntity>;
  let credentials: Repository<CredentialEntity>;
  let adapter: ExecutionAdapter;
  let draftStore: WorkflowDraftStore;
  let draftId: string;

  beforeEach(async () => {
    requestCount = 0;
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    workflows = dataSource.getRepository(WorkflowEntity);
    credentials = dataSource.getRepository(CredentialEntity);

    // Raw SQL, not the repository API — same TS2589 workaround as workflow-repository.adapter.test.ts:
    // TypeORM's generic insert()/save() types recurse excessively deep against WorkflowEntity's
    // nested INode[]/IConnections structural types. A type-checker-only issue, not a runtime one.
    await dataSource.query('INSERT INTO workflow (id, name, active, nodes, connections) VALUES (?, ?, ?, ?, ?)', [
      'wf-1',
      'Test',
      0,
      JSON.stringify([triggerNode, httpNode('Get Node', 'GET'), httpNode('Post Node', 'POST')]),
      JSON.stringify({ 'Manual Trigger': { main: [[{ node: 'Get Node', type: 'main', index: 0 }, { node: 'Post Node', type: 'main', index: 0 }]] } }),
    ]);

    draftStore = new WorkflowDraftStore(new WorkflowRepositoryAdapter(workflows));
    const draft = await draftStore.open('wf-1');
    draftId = draft.id;

    adapter = new ExecutionAdapter(
      draftStore,
      draftId,
      registerAllNodeTypes(new MapNodeTypes()),
      registerAllCredentialTypes(new MapCredentialTypes()),
      credentials,
      'test-encryption-key',
    );
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('dry run: a GET node actually runs — real network call, real data back', async () => {
    const summary = await adapter.run('Get Node', true);

    expect(requestCount).toBe(1);
    expect(summary.status).toBe('success');
    expect(summary.perNode['Get Node']?.itemCount).toBe(1);
    expect(summary.perNode['Get Node']?.mocked).toBeFalsy();

    const output = adapter.getNodeOutput('Get Node');
    expect(output).toMatchObject({ itemCount: 1, mocked: false, schema: { method: 'string', path: 'string', hello: 'string' } });
    expect(output?.sample).toEqual({ method: 'GET', path: '/', hello: 'world' });
  });

  it('dry run: a POST node is mocked — no real network call, passthrough data only', async () => {
    const summary = await adapter.run('Post Node', true);

    expect(requestCount).toBe(0); // the write was never actually sent
    expect(summary.perNode['Post Node']).toMatchObject({ mocked: true });

    const output = adapter.getNodeOutput('Post Node');
    expect(output?.mocked).toBe(true);
    // Passthrough of the trigger's single empty item — not the server's real (never called) response.
    expect(output?.sample).toEqual({});
  });

  it('live run: a POST node actually runs — real network call this time', async () => {
    const summary = await adapter.run('Post Node', false);

    expect(requestCount).toBe(1);
    expect(summary.perNode['Post Node']?.itemCount).toBe(1);
    expect(summary.perNode['Post Node']?.mocked).toBeFalsy();
    expect(adapter.getNodeOutput('Post Node')?.sample).toEqual({ method: 'POST', path: '/', hello: 'world' });
  });

  it('getNodeOutput returns undefined for a node that has not been run yet this instance', () => {
    expect(adapter.getNodeOutput('Get Node')).toBeUndefined();
  });

  it('re-reads the draft\'s current nodes on every run() call, reflecting a mutation made after construction', async () => {
    draftStore.mutate(draftId, (workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) => (node.name === 'Get Node' ? { ...node, parameters: { ...node.parameters, url: `${serverUrl}/changed` } } : node)),
    }));

    await adapter.run('Get Node', true);

    // Proves it re-read the mutated draft rather than a stale snapshot: the real request hit
    // the new path, not the original one.
    expect(adapter.getNodeOutput('Get Node')?.sample).toMatchObject({ path: '/changed' });
  });
});
