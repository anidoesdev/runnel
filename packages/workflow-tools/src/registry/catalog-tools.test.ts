import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@n8n-clone/core';
import { invokeTool } from './invoke-tool.js';
import { createToolRegistry } from './tools.js';
import { WorkflowDraftStore } from '../draft/workflow-draft.store.js';
import type { IToolContext } from './tool.js';
import type { INodeType, IWorkflowBase } from '@n8n-clone/workflow';
import type { IWorkflowRepositoryPort } from '../draft/workflow-repository.port.js';

const httpType: INodeType = {
  description: {
    displayName: 'HTTP Request',
    name: 'httpRequest',
    group: ['transform'],
    version: 1,
    description: 'Makes an HTTP request',
    defaults: { name: 'HTTP Request' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      { displayName: 'URL', name: 'url', type: 'string', default: '', required: true },
      {
        displayName: 'Method',
        name: 'method',
        type: 'options',
        default: 'GET',
        options: [
          { name: 'GET', value: 'GET' },
          { name: 'POST', value: 'POST' },
        ],
      },
    ],
  },
};

function fakeRepository(): IWorkflowRepositoryPort {
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

async function makeContext(): Promise<IToolContext> {
  const nodeTypes = new MapNodeTypes().register(httpType);
  const draftStore = new WorkflowDraftStore(fakeRepository());
  const draft = await draftStore.open('wf-1');
  return { draftId: draft.id, nodeTypes, draftStore };
}

describe('catalog tools', () => {
  it('search_nodes finds a registered type by a query term in its description', async () => {
    const ctx = await makeContext();
    const results = (await invokeTool(createToolRegistry(), 'search_nodes', { query: 'http request' }, ctx)) as Array<{ type: string }>;
    expect(results[0]?.type).toBe('httpRequest');
  });

  it('get_node_schema returns the compressed schema for a registered type', async () => {
    const ctx = await makeContext();
    const schema = await invokeTool(createToolRegistry(), 'get_node_schema', { type: 'httpRequest' }, ctx);
    expect(schema).toMatchObject({ type: 'httpRequest', displayName: 'HTTP Request' });
  });

  it('get_node_schema filters by currentParameters when given', async () => {
    const ctx = await makeContext();
    const schema = (await invokeTool(
      createToolRegistry(),
      'get_node_schema',
      { type: 'httpRequest', currentParameters: { url: 'https://x.test' } },
      ctx,
    )) as { properties: Array<{ name: string }> };
    expect(schema.properties.map((p) => p.name)).toEqual(['url', 'method']);
  });

  it('get_node_schema rejects an unknown type with UNKNOWN_NODE_TYPE, not a raw registry error', async () => {
    const ctx = await makeContext();
    await expect(invokeTool(createToolRegistry(), 'get_node_schema', { type: 'nope' }, ctx)).rejects.toMatchObject({
      code: 'UNKNOWN_NODE_TYPE',
      retryable: true,
    });
  });

  it('get_node_options returns the full option list for a field', async () => {
    const ctx = await makeContext();
    const options = await invokeTool(createToolRegistry(), 'get_node_options', { type: 'httpRequest', field: 'method' }, ctx);
    expect(options).toEqual([
      { name: 'GET', value: 'GET' },
      { name: 'POST', value: 'POST' },
    ]);
  });

  it('get_node_options rejects a field that has no options', async () => {
    const ctx = await makeContext();
    await expect(
      invokeTool(createToolRegistry(), 'get_node_options', { type: 'httpRequest', field: 'url' }, ctx),
    ).rejects.toMatchObject({ code: 'INVALID_ARGS' });
  });
});
