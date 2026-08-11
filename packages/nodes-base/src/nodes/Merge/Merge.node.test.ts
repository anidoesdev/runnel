import { describe, expect, it } from 'vitest';
import { merge } from './Merge.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';
import type { INodeExecutionData, NodeOutput } from '@n8n-clone/workflow';

function run(mode: string, input0: INodeExecutionData[], input1: INodeExecutionData[], key?: string): Promise<NodeOutput> {
  const node = makeNode({ name: 'Merge', type: 'merge', parameters: { mode, key } });
  const ctx = makeExecuteFunctions([], { node, inputData: [input0, input1] });
  return merge.execute!.call(ctx);
}

describe('Merge node — append', () => {
  it('concatenates input 0 followed by input 1', async () => {
    const result = await run('append', [{ json: { a: 1 } }], [{ json: { b: 2 } }]);
    expect(result[0]).toEqual([{ json: { a: 1 } }, { json: { b: 2 } }]);
  });
});

describe('Merge node — combineByPosition', () => {
  it('zips items by index, merging json fields', async () => {
    const result = await run(
      'combineByPosition',
      [{ json: { a: 1 } }, { json: { a: 2 } }],
      [{ json: { b: 10 } }, { json: { b: 20 } }],
    );
    expect(result[0]).toEqual([
      { json: { a: 1, b: 10 }, pairedItem: [{ item: 0, input: 0 }, { item: 0, input: 1 }] },
      { json: { a: 2, b: 20 }, pairedItem: [{ item: 1, input: 0 }, { item: 1, input: 1 }] },
    ]);
  });

  it('treats a missing side as an empty object when lengths differ', async () => {
    const result = await run('combineByPosition', [{ json: { a: 1 } }, { json: { a: 2 } }], [{ json: { b: 10 } }]);
    expect(result[0]).toHaveLength(2);
    expect(result[0]![1]!.json).toEqual({ a: 2 });
  });

  it('treats a missing left side as an empty object when input 0 is the shorter one', async () => {
    const result = await run('combineByPosition', [{ json: { a: 1 } }], [{ json: { b: 10 } }, { json: { b: 20 } }]);
    expect(result[0]).toHaveLength(2);
    expect(result[0]![1]!.json).toEqual({ b: 20 });
  });
});

describe('Merge node — combineByKey', () => {
  it('inner-joins on the configured key', async () => {
    const result = await run(
      'combineByKey',
      [{ json: { id: 1, name: 'a' } }, { json: { id: 2, name: 'b' } }],
      [{ json: { id: 2, score: 99 } }, { json: { id: 3, score: 1 } }],
      'id',
    );
    expect(result[0]).toEqual([
      { json: { id: 2, name: 'b', score: 99 }, pairedItem: [{ item: 1, input: 0 }, { item: 0, input: 1 }] },
    ]);
  });

  it('drops unmatched rows from both sides', async () => {
    const result = await run('combineByKey', [{ json: { id: 1 } }], [{ json: { id: 2 } }], 'id');
    expect(result[0]).toEqual([]);
  });
});
