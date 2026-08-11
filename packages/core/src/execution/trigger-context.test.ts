import { describe, expect, it, vi } from 'vitest';
import { buildPollFunctions, buildTriggerFunctions, buildWebhookFunctions } from './trigger-context.js';
import { makeNode, makeWorkflow } from './test-utils.js';
import type { IPollOrTriggerFunctionsOptions } from './trigger-context.js';

function baseOptions(overrides: Partial<IPollOrTriggerFunctionsOptions> = {}): IPollOrTriggerFunctionsOptions {
  const node = overrides.node ?? makeNode({ name: 'Node1', parameters: {} });
  return {
    node,
    workflow: makeWorkflow([node], {}),
    mode: 'trigger',
    ...overrides,
  };
}

describe('buildPollFunctions — getWorkflowStaticData', () => {
  it('returns an empty object the first time, per node', () => {
    const ctx = buildPollFunctions(baseOptions());
    expect(ctx.getWorkflowStaticData('node')).toEqual({});
    expect(ctx.getWorkflowStaticData('global')).toEqual({});
  });

  it('persists mutations back onto workflow.staticData across calls', () => {
    const options = baseOptions();
    const ctx = buildPollFunctions(options);

    (ctx.getWorkflowStaticData('node') as Record<string, unknown>).lastId = 42;
    expect(ctx.getWorkflowStaticData('node')).toEqual({ lastId: 42 });
    expect(options.workflow.staticData).toEqual({ node: { Node1: { lastId: 42 } } });
  });

  it('keeps node-scoped static data separate per node name', () => {
    const nodeA = makeNode({ name: 'A', parameters: {} });
    const nodeB = makeNode({ name: 'B', parameters: {} });
    const workflow = makeWorkflow([nodeA, nodeB], {});

    const ctxA = buildPollFunctions({ node: nodeA, workflow, mode: 'trigger' });
    const ctxB = buildPollFunctions({ node: nodeB, workflow, mode: 'trigger' });

    (ctxA.getWorkflowStaticData('node') as Record<string, unknown>).x = 1;
    expect(ctxB.getWorkflowStaticData('node')).toEqual({});
  });

  it('keeps global static data shared across nodes on the same workflow', () => {
    const nodeA = makeNode({ name: 'A', parameters: {} });
    const nodeB = makeNode({ name: 'B', parameters: {} });
    const workflow = makeWorkflow([nodeA, nodeB], {});

    const ctxA = buildPollFunctions({ node: nodeA, workflow, mode: 'trigger' });
    const ctxB = buildPollFunctions({ node: nodeB, workflow, mode: 'trigger' });

    (ctxA.getWorkflowStaticData('global') as Record<string, unknown>).seen = true;
    expect(ctxB.getWorkflowStaticData('global')).toEqual({ seen: true });
  });

  it('still resolves node parameters, including expressions', () => {
    const node = makeNode({ name: 'N', parameters: { value: '={{ 2 + 2 }}' } });
    const ctx = buildPollFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('value', 0)).toBe(4);
  });
});

describe('buildTriggerFunctions', () => {
  it('exposes emit() and the shared getWorkflowStaticData', () => {
    const emit = vi.fn();
    const ctx = buildTriggerFunctions({ ...baseOptions(), emit });

    ctx.emit([[{ json: { hello: 'world' } }]]);
    expect(emit).toHaveBeenCalledWith([[{ json: { hello: 'world' } }]]);
    expect(ctx.getWorkflowStaticData('node')).toEqual({});
  });
});

describe('buildWebhookFunctions', () => {
  it('exposes the request and response objects passed in', () => {
    const response = { status: vi.fn(), send: vi.fn() };
    const ctx = buildWebhookFunctions({
      ...baseOptions(),
      mode: 'webhook',
      request: { method: 'POST', headers: { 'content-type': 'application/json' }, body: { a: 1 }, query: {} },
      response,
    });

    expect(ctx.getRequestObject()).toEqual({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { a: 1 },
      query: {},
    });

    ctx.getResponseObject().status(200);
    expect(response.status).toHaveBeenCalledWith(200);
  });
});
