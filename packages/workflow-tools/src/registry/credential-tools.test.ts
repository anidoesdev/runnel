import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { invokeTool } from './invoke-tool.js';
import { createToolRegistry } from './tools.js';
import { WorkflowDraftStore } from '../draft/workflow-draft.store.js';
import type { ICredentialRepositoryPort, ICredentialSummary } from '../draft/credential-repository.port.js';
import type { IToolContext } from './tool.js';
import type { INodeType, IWorkflowBase } from '@runnel/workflow';
import type { IWorkflowRepositoryPort } from '../draft/workflow-repository.port.js';

function fakeWorkflowRepository(): IWorkflowRepositoryPort {
  const workflow: IWorkflowBase = { id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} };
  return {
    async get() {
      return structuredClone(workflow);
    },
    async save(_id, next) {
      return structuredClone(next);
    },
  };
}

function fakeCredentialRepository(seed: ICredentialSummary[] = []): ICredentialRepositoryPort & { created: ICredentialSummary[] } {
  const stored = [...seed];
  const created: ICredentialSummary[] = [];
  return {
    created,
    async list(type) {
      return type ? stored.filter((c) => c.type === type) : stored;
    },
    async createPlaceholder(type, name) {
      const summary: ICredentialSummary = { id: `cred-${stored.length + 1}`, name, type };
      stored.push(summary);
      created.push(summary);
      return summary;
    },
  };
}

/** A node per credential type the tests use — a type only counts once some node uses it. */
function nodeUsing(name: string, credential: string): INodeType {
  return {
    description: {
      displayName: name,
      name,
      group: ['transform'],
      version: 1,
      description: `uses ${credential}`,
      defaults: { name },
      inputs: ['main'],
      outputs: ['main'],
      properties: [],
      credentials: [{ name: credential }],
    },
  };
}

async function makeContext(credentials?: ICredentialRepositoryPort): Promise<IToolContext> {
  const draftStore = new WorkflowDraftStore(fakeWorkflowRepository());
  const draft = await draftStore.open('wf-1');
  const nodeTypes = new MapNodeTypes()
    .register(nodeUsing('chatModel', 'openAiApi'))
    .register(nodeUsing('postgres', 'postgresApi'))
    .register(nodeUsing('slack', 'slackApi'));
  return { draftId: draft.id, nodeTypes, draftStore, credentials };
}

describe('credential tools', () => {
  it('list_credentials returns id/name/type only, filtered by type when given', async () => {
    const credentials = fakeCredentialRepository([
      { id: 'c1', name: 'My OpenAI', type: 'openAiApi' },
      { id: 'c2', name: 'My Postgres', type: 'postgresApi' },
    ]);
    const ctx = await makeContext(credentials);

    const all = await invokeTool(createToolRegistry(), 'list_credentials', {}, ctx);
    expect(all).toEqual([
      { id: 'c1', name: 'My OpenAI', type: 'openAiApi' },
      { id: 'c2', name: 'My Postgres', type: 'postgresApi' },
    ]);

    const filtered = await invokeTool(createToolRegistry(), 'list_credentials', { type: 'openAiApi' }, ctx);
    expect(filtered).toEqual([{ id: 'c1', name: 'My OpenAI', type: 'openAiApi' }]);
  });

  it('request_credential creates a placeholder and returns a setup link, never a value', async () => {
    const credentials = fakeCredentialRepository();
    const ctx = await makeContext(credentials);

    const result = (await invokeTool(createToolRegistry(), 'request_credential', { type: 'slackApi' }, ctx)) as {
      setupUrl: string;
      credentialId: string;
    };

    expect(credentials.created).toHaveLength(1);
    expect(credentials.created[0]!.type).toBe('slackApi');
    expect(result.credentialId).toBe(credentials.created[0]!.id);
    expect(result.setupUrl).toContain(result.credentialId);
    expect(JSON.stringify(result)).not.toMatch(/apiKey|secret|password/i);
  });

  it('rejects a credential type no node uses, naming the real ones, instead of an empty list', async () => {
    const credentials = fakeCredentialRepository([{ id: 'c1', name: 'My OpenAI', type: 'openAiApi' }]);
    const ctx = await makeContext(credentials);

    await expect(invokeTool(createToolRegistry(), 'list_credentials', { type: 'openai' }, ctx)).rejects.toMatchObject({
      code: 'INVALID_ARGS',
      message: expect.stringContaining('Credential types in use: openAiApi, postgresApi, slackApi'),
    });
  });

  it('refuses to create a placeholder of a type no node could use', async () => {
    const credentials = fakeCredentialRepository();
    const ctx = await makeContext(credentials);

    await expect(invokeTool(createToolRegistry(), 'request_credential', { type: 'openai' }, ctx)).rejects.toMatchObject({ code: 'INVALID_ARGS' });
    expect(credentials.created).toEqual([]);
  });

  it('rejects both tools with a clear error when the session has no credential access configured', async () => {
    const ctx = await makeContext(undefined);

    await expect(invokeTool(createToolRegistry(), 'list_credentials', {}, ctx)).rejects.toMatchObject({
      message: expect.stringContaining('no credential access'),
    });
    await expect(invokeTool(createToolRegistry(), 'request_credential', { type: 'slackApi' }, ctx)).rejects.toMatchObject({
      message: expect.stringContaining('no credential access'),
    });
  });
});
