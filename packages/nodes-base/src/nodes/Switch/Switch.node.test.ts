import { describe, expect, it } from 'vitest';
import { switchNode } from './Switch.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Switch node', () => {
  it('routes each item to the first matching rule\'s output', async () => {
    const node = makeNode({
      name: 'Switch',
      type: 'switch',
      parameters: {
        rules: {
          values: [
            { outputIndex: 0, leftValue: '={{ $json.tier }}', operator: 'equals', rightValue: 'gold' },
            { outputIndex: 1, leftValue: '={{ $json.tier }}', operator: 'equals', rightValue: 'silver' },
          ],
        },
      },
    });
    const ctx = makeExecuteFunctions([{ json: { tier: 'gold' } }, { json: { tier: 'silver' } }, { json: { tier: 'bronze' } }], { node });

    const result = await switchNode.execute!.call(ctx);
    expect(result).toHaveLength(4);
    expect(result[0]).toEqual([{ json: { tier: 'gold' }, pairedItem: { item: 0 } }]);
    expect(result[1]).toEqual([{ json: { tier: 'silver' }, pairedItem: { item: 1 } }]);
    expect(result[2]).toEqual([]);
    expect(result[3]).toEqual([{ json: { tier: 'bronze' }, pairedItem: { item: 2 } }]);
  });

  it('sends an item to the fallback output when there are no rules at all', async () => {
    const node = makeNode({ name: 'Switch', type: 'switch', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }], { node });

    const result = await switchNode.execute!.call(ctx);
    expect(result[3]).toEqual([{ json: { a: 1 }, pairedItem: { item: 0 } }]);
  });

  it('clamps an out-of-range outputIndex into the valid 0-2 slot range', async () => {
    const node = makeNode({
      name: 'Switch',
      type: 'switch',
      parameters: { rules: { values: [{ outputIndex: 99, leftValue: 'a', operator: 'equals', rightValue: 'a' }] } },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });

    const result = await switchNode.execute!.call(ctx);
    expect(result[2]).toEqual([{ json: {}, pairedItem: { item: 0 } }]);
  });

  it('declares four outputs', () => {
    expect(switchNode.description.outputs).toEqual(['main', 'main', 'main', 'main']);
  });
});
