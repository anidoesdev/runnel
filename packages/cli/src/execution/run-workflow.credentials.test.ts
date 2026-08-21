import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptCredentialData, MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { runWorkflowDefinition } from './run-workflow.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { IExecuteFunctions, INode, INodeType, IWorkflowBase, NodeOutput } from '@n8n-clone/workflow';

const ENCRYPTION_KEY = 'test-encryption-key';

/** Echoes back whatever `getCredentials('testCred')` resolves to, as the node's own output — lets a test assert exactly which stored row a run actually used. */
const echoCredentialNode: INodeType = {
  description: {
    displayName: 'Echo Credential',
    name: 'test.echoCredential',
    group: ['transform'],
    version: 1,
    description: 'Test node',
    defaults: { name: 'Echo Credential' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    credentials: [{ name: 'testCred' }],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const credentials = await this.getCredentials('testCred');
    return [[{ json: credentials }]];
  },
};

function nodeTypes() {
  return new MapNodeTypes().register(echoCredentialNode);
}

function credentialTypes() {
  return new MapCredentialTypes().register({ name: 'testCred', displayName: 'Test Credential', properties: [] });
}

describe('runWorkflowDefinition — credential resolution', () => {
  let dataSource: DataSource;
  let credentials: Repository<CredentialEntity>;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    credentials = dataSource.getRepository(CredentialEntity);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  async function insertCredential(id: string, value: string): Promise<void> {
    const encrypted = encryptCredentialData({ value }, ENCRYPTION_KEY);
    await credentials.insert({ id, name: id, type: 'testCred', data: JSON.stringify(encrypted) });
  }

  function workflowUsing(node: Partial<INode> = {}): IWorkflowBase {
    const echoNode: INode = {
      id: 'n1',
      name: 'Echo',
      type: 'test.echoCredential',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
      ...node,
    };
    return { id: 'wf-1', name: 'Test', active: false, nodes: [echoNode], connections: {} };
  }

  it("resolves the node's specifically-assigned credential id, not just any credential of that type", async () => {
    // The "broken placeholder created first, real one added later" scenario: type-only lookup
    // would non-deterministically return whichever row TypeORM happens to return first — here,
    // asserting on the *second*, later-inserted row proves it's not just "the first match".
    await insertCredential('placeholder', 'unset');
    await insertCredential('real', 'sk-real-value');

    const workflow = workflowUsing({ credentials: { testCred: { id: 'real', name: 'real' } } });
    const { result } = await runWorkflowDefinition(
      workflow,
      { nodeTypes: nodeTypes(), credentialTypes: credentialTypes(), credentials, encryptionKey: ENCRYPTION_KEY },
      { mode: 'manual' },
    );

    expect(result.resultData.runData.Echo?.[0]?.data?.main[0]?.[0]?.json).toEqual({ value: 'sk-real-value' });
  });

  it('falls back to type-only lookup for a node with no credential explicitly assigned', async () => {
    await insertCredential('only-one', 'sk-only-value');

    const workflow = workflowUsing(); // no `credentials` field at all
    const { result } = await runWorkflowDefinition(
      workflow,
      { nodeTypes: nodeTypes(), credentialTypes: credentialTypes(), credentials, encryptionKey: ENCRYPTION_KEY },
      { mode: 'manual' },
    );

    expect(result.resultData.runData.Echo?.[0]?.data?.main[0]?.[0]?.json).toEqual({ value: 'sk-only-value' });
  });

  it('errors on the assigned id rather than silently substituting a different stored credential', async () => {
    await insertCredential('some-other-row', 'sk-other');

    const workflow = workflowUsing({ credentials: { testCred: { id: 'missing-id', name: 'gone' } } });
    const { result } = await runWorkflowDefinition(
      workflow,
      { nodeTypes: nodeTypes(), credentialTypes: credentialTypes(), credentials, encryptionKey: ENCRYPTION_KEY },
      { mode: 'manual' },
    );

    expect(result.resultData.runData.Echo?.[0]?.error?.message).toContain('missing-id');
  });
});
