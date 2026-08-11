import { describe, expect, it, vi } from 'vitest';
import { webhook } from './Webhook.node.js';
import { makeNode, makeWebhookFunctions } from '../../test-utils.js';

describe('Webhook node', () => {
  it('turns the incoming request into a single output item', async () => {
    const node = makeNode({ name: 'Webhook', type: 'webhook', parameters: { httpMethod: 'POST', path: 'my-hook' } });
    const ctx = makeWebhookFunctions({
      node,
      request: { method: 'POST', headers: { 'x-test': '1' }, body: { hello: 'world' }, query: { a: '1' } },
      response: { status: vi.fn(), send: vi.fn() },
    });

    const result = await webhook.webhook!.call(ctx);
    expect(result.workflowData).toEqual([
      [{ json: { headers: { 'x-test': '1' }, params: {}, query: { a: '1' }, body: { hello: 'world' } } }],
    ]);
  });

  it('handles a missing/empty body', async () => {
    const node = makeNode({ name: 'Webhook', type: 'webhook', parameters: { httpMethod: 'GET', path: 'my-hook' } });
    const ctx = makeWebhookFunctions({
      node,
      request: { method: 'GET', headers: {}, body: undefined, query: {} },
      response: { status: vi.fn(), send: vi.fn() },
    });

    const result = await webhook.webhook!.call(ctx);
    expect(result.workflowData?.[0]?.[0]?.json.body).toBeNull();
  });

  it('declares no inputs (it is a trigger)', () => {
    expect(webhook.description.inputs).toEqual([]);
  });
});
