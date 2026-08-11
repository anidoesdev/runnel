import { describe, expect, it } from 'vitest';
import { noOp } from './NoOp.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('No Op node', () => {
  it('passes its input through unchanged', async () => {
    const node = makeNode({ name: 'No Op', type: 'noOp' });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }, { json: { a: 2 } }], { node });
    const result = await noOp.execute!.call(ctx);
    expect(result).toEqual([[{ json: { a: 1 } }, { json: { a: 2 } }]]);
  });
});
