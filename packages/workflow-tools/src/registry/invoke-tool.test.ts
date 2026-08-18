import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MapNodeTypes } from '@n8n-clone/core';
import { invokeTool } from './invoke-tool.js';
import { createToolRegistry } from './tools.js';
import { WorkflowDraftStore } from '../draft/workflow-draft.store.js';
import { ToolError } from '../errors.js';
import type { AnyTool, IToolContext, ITool } from './tool.js';
import type { IWorkflowBase } from '@n8n-clone/workflow';
import type { IWorkflowRepositoryPort } from '../draft/workflow-repository.port.js';

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
  const draftStore = new WorkflowDraftStore(fakeRepository());
  const draft = await draftStore.open('wf-1');
  return { draftId: draft.id, nodeTypes: new MapNodeTypes(), draftStore };
}

describe('invokeTool', () => {
  it('rejects an unknown tool name', async () => {
    const ctx = await makeContext();
    await expect(invokeTool(createToolRegistry(), 'not_a_real_tool', {}, ctx)).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
    });
  });

  it('rejects arguments that fail the tool\'s own schema before the handler ever runs', async () => {
    const ctx = await makeContext();
    let handlerCalled = false;
    const tool: ITool<{ n: number }, unknown> = {
      name: 'needs_number',
      description: 'test',
      parameters: z.object({ n: z.number() }),
      handler: () => {
        handlerCalled = true;
        return {};
      },
    };
    const registry = createToolRegistry([tool as unknown as AnyTool]);

    await expect(invokeTool(registry, 'needs_number', { n: 'not a number' }, ctx)).rejects.toMatchObject({
      code: 'INVALID_ARGS',
    });
    expect(handlerCalled).toBe(false);
  });

  it('returns the handler\'s result on success', async () => {
    const ctx = await makeContext();
    const registry = createToolRegistry();
    const result = await invokeTool(registry, 'get_workflow_outline', {}, ctx);
    expect(result).toEqual({ nodes: [], connections: [] });
  });

  it('maps a core mutation error to a typed ToolError by instanceof, not message text', async () => {
    const ctx = await makeContext();
    const registry = createToolRegistry();
    await expect(invokeTool(registry, 'add_node', { type: 'not.a.real.type' }, ctx)).rejects.toMatchObject({
      code: 'UNKNOWN_NODE_TYPE',
      retryable: true,
    });
  });

  it('passes through a ToolError a handler throws directly', async () => {
    const ctx = await makeContext();
    const tool: ITool<Record<string, never>, unknown> = {
      name: 'always_fails',
      description: 'test',
      parameters: z.object({}),
      handler: () => {
        throw new ToolError({ code: 'INTERNAL', message: 'boom', retryable: false });
      },
    };
    const registry = createToolRegistry([tool as unknown as AnyTool]);

    await expect(invokeTool(registry, 'always_fails', {}, ctx)).rejects.toMatchObject({ code: 'INTERNAL', message: 'boom' });
  });
});
