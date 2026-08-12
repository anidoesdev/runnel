import { describe, expect, it } from 'vitest';
import { filterNode } from './Filter.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Filter node', () => {
  it('keeps only items matching the condition', async () => {
    const node = makeNode({
      name: 'Filter',
      type: 'filter',
      parameters: { conditions: { values: [{ leftValue: '={{ $json.active }}', operator: 'equals', rightValue: true }] } },
    });
    const ctx = makeExecuteFunctions([{ json: { active: true, name: 'a' } }, { json: { active: false, name: 'b' } }], { node });

    const result = await filterNode.execute!.call(ctx);
    expect(result).toEqual([[{ json: { active: true, name: 'a' }, pairedItem: { item: 0 } }]]);
  });

  it('keeps every item when there are no conditions', async () => {
    const node = makeNode({ name: 'Filter', type: 'filter', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }, { json: { a: 2 } }], { node });

    const result = await filterNode.execute!.call(ctx);
    expect(result[0]).toHaveLength(2);
  });

  it('declares a single output', () => {
    expect(filterNode.description.outputs).toEqual(['main']);
  });
});
