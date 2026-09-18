import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { invokeTool } from './invoke-tool.js';
import { createToolRegistry } from './tools.js';
import { WorkflowDraftStore } from '../draft/workflow-draft.store.js';
import type { IToolContext } from './tool.js';
import type { INodeType, IWorkflowBase } from '@runnel/workflow';
import type { IWorkflowRepositoryPort } from '../draft/workflow-repository.port.js';

const triggerType: INodeType = {
  description: {
    displayName: 'Manual Trigger',
    name: 'manualTrigger',
    group: ['trigger'],
    version: 1,
    description: 'Test trigger',
    defaults: { name: 'Manual Trigger' },
    inputs: [],
    outputs: ['main'],
    properties: [],
  },
};

const httpType: INodeType = {
  description: {
    displayName: 'HTTP Request',
    name: 'httpRequest',
    group: ['transform'],
    version: 1,
    description: 'Test HTTP node',
    defaults: { name: 'HTTP Request' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [{ displayName: 'URL', name: 'url', type: 'string', default: '', required: true }],
    credentials: [{ name: 'httpBasicAuth' }],
  },
};

function nodeTypes() {
  return new MapNodeTypes().register(triggerType).register(httpType);
}

function fakeRepository(): IWorkflowRepositoryPort & { saved: IWorkflowBase[] } {
  const saved: IWorkflowBase[] = [];
  let workflow: IWorkflowBase = { id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} };
  return {
    saved,
    async get() {
      return structuredClone(workflow);
    },
    async save(_id, next) {
      workflow = structuredClone(next);
      saved.push(workflow);
      return workflow;
    },
  };
}

async function openDraft(repo: IWorkflowRepositoryPort): Promise<{ draftStore: WorkflowDraftStore; ctx: IToolContext }> {
  const draftStore = new WorkflowDraftStore(repo);
  const draft = await draftStore.open('wf-1');
  return { draftStore, ctx: { draftId: draft.id, nodeTypes: nodeTypes(), draftStore } };
}

describe('Milestone 1 tool set — builds a workflow end to end and applies it', () => {
  it('adds two nodes, connects them, configures parameters, attaches a credential, then applies the draft to the real workflow', async () => {
    const repo = fakeRepository();
    const { draftStore, ctx } = await openDraft(repo);
    const registry = createToolRegistry();

    const trigger = (await invokeTool(registry, 'add_node', { type: 'manualTrigger' }, ctx)) as { name: string };
    const http = (await invokeTool(registry, 'add_node', { type: 'httpRequest', name: 'Call API' }, ctx)) as { name: string };
    await invokeTool(registry, 'connect_nodes', { from: trigger.name, to: http.name }, ctx);
    await invokeTool(registry, 'set_node_parameters', { name: http.name, parameters: { url: 'https://example.com' } }, ctx);
    await invokeTool(registry, 'set_node_credential', { name: http.name, credentialType: 'httpBasicAuth', credentialId: 'cred-1' }, ctx);

    const outline = await invokeTool(registry, 'get_workflow_outline', {}, ctx);
    expect(outline).toEqual({
      nodes: [
        { name: 'Manual Trigger', type: 'manualTrigger', disabled: false, unsetRequiredParams: [] },
        { name: 'Call API', type: 'httpRequest', disabled: false, unsetRequiredParams: [] },
      ],
      connections: [{ from: 'Manual Trigger', outputIndex: 0, to: 'Call API', inputIndex: 0, type: 'main' }],
    });

    // Nothing is persisted until the draft is applied.
    expect(repo.saved).toHaveLength(0);

    const applied = await draftStore.apply(ctx.draftId);

    expect(repo.saved).toHaveLength(1);
    expect(applied.nodes.map((n) => n.name)).toEqual(['Manual Trigger', 'Call API']);
    expect(applied.nodes[1]!.credentials).toEqual({ httpBasicAuth: { id: 'cred-1', name: 'cred-1' } });
  });

  it('rolls back cleanly: discarding a draft leaves the real workflow untouched', async () => {
    const repo = fakeRepository();
    const { draftStore, ctx } = await openDraft(repo);
    const registry = createToolRegistry();

    await invokeTool(registry, 'add_node', { type: 'manualTrigger' }, ctx);
    expect(draftStore.get(ctx.draftId).current.nodes).toHaveLength(1);

    draftStore.discard(ctx.draftId);

    expect(repo.saved).toHaveLength(0);
    const stillLive = await repo.get('wf-1');
    expect(stillLive.nodes).toHaveLength(0);
  });

  it('rename_node rewrites the connection recorded by an earlier connect_nodes call in the same draft', async () => {
    const repo = fakeRepository();
    const { ctx } = await openDraft(repo);
    const registry = createToolRegistry();

    const trigger = (await invokeTool(registry, 'add_node', { type: 'manualTrigger' }, ctx)) as { name: string };
    const http = (await invokeTool(registry, 'add_node', { type: 'httpRequest' }, ctx)) as { name: string };
    await invokeTool(registry, 'connect_nodes', { from: trigger.name, to: http.name }, ctx);

    await invokeTool(registry, 'rename_node', { oldName: trigger.name, newName: 'Start Here' }, ctx);

    const outline = (await invokeTool(registry, 'get_workflow_outline', {}, ctx)) as { connections: Array<{ from: string }> };
    expect(outline.connections[0]!.from).toBe('Start Here');
  });

  it('remove_node cleans up the connection add_node + connect_nodes had created', async () => {
    const repo = fakeRepository();
    const { ctx } = await openDraft(repo);
    const registry = createToolRegistry();

    const trigger = (await invokeTool(registry, 'add_node', { type: 'manualTrigger' }, ctx)) as { name: string };
    const http = (await invokeTool(registry, 'add_node', { type: 'httpRequest' }, ctx)) as { name: string };
    await invokeTool(registry, 'connect_nodes', { from: trigger.name, to: http.name }, ctx);

    await invokeTool(registry, 'remove_node', { name: http.name }, ctx);

    const outline = (await invokeTool(registry, 'get_workflow_outline', {}, ctx)) as {
      nodes: unknown[];
      connections: unknown[];
    };
    expect(outline.nodes).toHaveLength(1);
    expect(outline.connections).toEqual([]);
  });
});

describe('add_node result', () => {
  const webhookLike: INodeType = {
    description: {
      displayName: 'Webhook',
      name: 'webhook',
      group: ['trigger'],
      version: 1,
      description: 'Starts the workflow when an HTTP request arrives',
      defaults: { name: 'Webhook' },
      inputs: [],
      outputs: ['main'],
      properties: [
        {
          displayName: 'HTTP Method',
          name: 'httpMethod',
          type: 'options',
          default: 'GET',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
          ],
        },
        { displayName: 'Path', name: 'path', type: 'string', default: '', required: true, description: 'The URL path to listen on' },
      ],
    },
  };

  async function addWebhook(parameters?: Record<string, unknown>) {
    const draftStore = new WorkflowDraftStore(fakeRepository());
    const draft = await draftStore.open('wf-1');
    const ctx: IToolContext = { draftId: draft.id, nodeTypes: new MapNodeTypes().register(webhookLike), draftStore };
    return invokeTool(createToolRegistry(), 'add_node', { type: 'webhook', ...(parameters ? { parameters } : {}) }, ctx);
  }

  it('echoes what was added, so a wrong node type is visible straight away', async () => {
    expect(await addWebhook()).toMatchObject({
      name: 'Webhook',
      added: { type: 'webhook', displayName: 'Webhook', description: 'Starts the workflow when an HTTP request arrives' },
    });
  });

  it('lists every parameter with its exact name and allowed values', async () => {
    const result = (await addWebhook()) as { parameters: Array<Record<string, unknown>> };
    expect(result.parameters).toEqual([
      { name: 'httpMethod', type: 'options', required: false, default: 'GET', options: ['GET', 'POST'] },
      { name: 'path', type: 'string', required: true, default: '', description: 'The URL path to listen on' },
    ]);
  });

  it('reports which required parameters are still unset', async () => {
    expect(await addWebhook()).toMatchObject({ unsetRequired: ['path'] });
    expect(await addWebhook({ path: 'orders' })).toMatchObject({ unsetRequired: [] });
  });
});
