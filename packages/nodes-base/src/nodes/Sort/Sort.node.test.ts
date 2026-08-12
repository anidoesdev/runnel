import { describe, expect, it } from 'vitest';
import { sortNode } from './Sort.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Sort node', () => {
  it('sorts ascending by a numeric field', async () => {
    const node = makeNode({ name: 'Sort', type: 'sort', parameters: { field: 'age', order: 'ascending' } });
    const ctx = makeExecuteFunctions([{ json: { age: 30 } }, { json: { age: 10 } }, { json: { age: 20 } }], { node });

    const result = await sortNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.age)).toEqual([10, 20, 30]);
  });

  it('sorts descending', async () => {
    const node = makeNode({ name: 'Sort', type: 'sort', parameters: { field: 'age', order: 'descending' } });
    const ctx = makeExecuteFunctions([{ json: { age: 1 } }, { json: { age: 3 } }, { json: { age: 2 } }], { node });

    const result = await sortNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.age)).toEqual([3, 2, 1]);
  });

  it('supports a dot-path field name', async () => {
    const node = makeNode({ name: 'Sort', type: 'sort', parameters: { field: 'user.age', order: 'ascending' } });
    const ctx = makeExecuteFunctions([{ json: { user: { age: 5 } } }, { json: { user: { age: 1 } } }], { node });

    const result = await sortNode.execute!.call(ctx);
    expect(result[0]!.map((item) => (item.json.user as { age: number }).age)).toEqual([1, 5]);
  });

  it('sorts strings alphabetically', async () => {
    const node = makeNode({ name: 'Sort', type: 'sort', parameters: { field: 'name', order: 'ascending' } });
    const ctx = makeExecuteFunctions([{ json: { name: 'banana' } }, { json: { name: 'apple' } }], { node });

    const result = await sortNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.name)).toEqual(['apple', 'banana']);
  });
});
