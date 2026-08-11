import { describe, expect, it } from 'vitest';
import { manualTrigger } from './ManualTrigger.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Manual Trigger node', () => {
  it('passes the seeded starting items through unchanged', async () => {
    const node = makeNode({ name: 'Manual Trigger', type: 'manualTrigger' });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }], { node });
    const result = await manualTrigger.execute!.call(ctx);
    expect(result).toEqual([[{ json: { a: 1 } }]]);
  });

  it('declares no inputs (it is a trigger)', () => {
    expect(manualTrigger.description.inputs).toEqual([]);
  });
});
