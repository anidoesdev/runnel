import { describe, expect, it } from 'vitest';
import { start } from './Start.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Start node', () => {
  it('passes the seeded starting items through unchanged', async () => {
    const node = makeNode({ name: 'Start', type: 'start' });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }], { node });
    const result = await start.execute!.call(ctx);
    expect(result).toEqual([[{ json: { a: 1 } }]]);
  });
});
