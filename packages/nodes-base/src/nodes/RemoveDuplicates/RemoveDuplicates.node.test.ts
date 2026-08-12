import { describe, expect, it } from 'vitest';
import { removeDuplicatesNode } from './RemoveDuplicates.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Remove Duplicates node', () => {
  it('removes items that fully duplicate an earlier item by default', async () => {
    const node = makeNode({ name: 'Remove Duplicates', type: 'removeDuplicates', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }, { json: { a: 1 } }, { json: { a: 2 } }], { node });

    const result = await removeDuplicatesNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('compares by a selected field only, ignoring the rest of the item', async () => {
    const node = makeNode({
      name: 'Remove Duplicates',
      type: 'removeDuplicates',
      parameters: { compare: 'field', field: 'id' },
    });
    const ctx = makeExecuteFunctions([{ json: { id: 1, name: 'a' } }, { json: { id: 1, name: 'b' } }, { json: { id: 2, name: 'c' } }], {
      node,
    });

    const result = await removeDuplicatesNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json)).toEqual([
      { id: 1, name: 'a' },
      { id: 2, name: 'c' },
    ]);
  });
});
