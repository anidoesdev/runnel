import { describe, expect, it } from 'vitest';
import { splitInBatches } from './SplitInBatches.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';
import type { INodeExecutionData } from '@runnel/workflow';

describe('Split In Batches node', () => {
  it('declares iterationNode so the workflow package allows a cycle through it', () => {
    expect(splitInBatches.description.iterationNode).toBe(true);
  });

  it('emits one item per call by default (batchSize 1), then the full set on the done branch', async () => {
    const node = makeNode({ name: 'Loop', type: 'splitInBatches', parameters: {} });
    const contextData: Record<string, unknown> = {};
    const items: INodeExecutionData[] = [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }];

    const call = () => splitInBatches.execute!.call(makeExecuteFunctions(items, { node, contextData }));

    const first = await call();
    expect(first[0]).toEqual([{ json: { n: 1 }, binary: undefined, pairedItem: { item: 0 } }]);
    expect(first[1]).toEqual([]);

    const second = await call();
    expect(second[0]).toEqual([{ json: { n: 2 }, binary: undefined, pairedItem: { item: 1 } }]);

    const third = await call();
    expect(third[0]).toEqual([{ json: { n: 3 }, binary: undefined, pairedItem: { item: 2 } }]);

    const fourth = await call();
    expect(fourth[0]).toEqual([]);
    expect(fourth[1]).toEqual(items);
  });

  it('respects a batchSize greater than 1', async () => {
    const node = makeNode({ name: 'Loop', type: 'splitInBatches', parameters: { batchSize: 2 } });
    const contextData: Record<string, unknown> = {};
    const items: INodeExecutionData[] = [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }];

    const call = () => splitInBatches.execute!.call(makeExecuteFunctions(items, { node, contextData }));

    const first = await call();
    expect(first[0]!.map((item) => item.json.n)).toEqual([1, 2]);

    const second = await call();
    expect(second[0]!.map((item) => item.json.n)).toEqual([3]);

    const third = await call();
    expect(third[0]).toEqual([]);
    expect(third[1]).toHaveLength(3);
  });

  it('only reads the real input on the first call — later calls ignore whatever is passed in', async () => {
    const node = makeNode({ name: 'Loop', type: 'splitInBatches', parameters: {} });
    const contextData: Record<string, unknown> = {};
    const items: INodeExecutionData[] = [{ json: { n: 1 } }, { json: { n: 2 } }];

    await splitInBatches.execute!.call(makeExecuteFunctions(items, { node, contextData }));
    // Second call passes different (empty) input data, as a real loop-back re-entry would.
    const second = await splitInBatches.execute!.call(
      makeExecuteFunctions([], { node, contextData, inputData: [[]] }),
    );
    expect(second[0]!.map((item) => item.json.n)).toEqual([2]);
  });
});
