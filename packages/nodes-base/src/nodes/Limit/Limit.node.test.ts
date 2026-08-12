import { describe, expect, it } from 'vitest';
import { limitNode } from './Limit.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

const fiveItems = [1, 2, 3, 4, 5].map((n) => ({ json: { n } }));

describe('Limit node', () => {
  it('keeps the first N items by default', async () => {
    const node = makeNode({ name: 'Limit', type: 'limit', parameters: { maxItems: 2 } });
    const ctx = makeExecuteFunctions(fiveItems, { node });

    const result = await limitNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.n)).toEqual([1, 2]);
  });

  it('keeps the last N items when configured', async () => {
    const node = makeNode({ name: 'Limit', type: 'limit', parameters: { maxItems: 2, keep: 'lastItems' } });
    const ctx = makeExecuteFunctions(fiveItems, { node });

    const result = await limitNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.n)).toEqual([4, 5]);
  });

  it('returns every item when maxItems exceeds the input length', async () => {
    const node = makeNode({ name: 'Limit', type: 'limit', parameters: { maxItems: 100 } });
    const ctx = makeExecuteFunctions(fiveItems, { node });

    const result = await limitNode.execute!.call(ctx);
    expect(result[0]).toHaveLength(5);
  });
});
