import { describe, expect, it } from 'vitest';
import { chatTrigger } from './ChatTrigger.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Chat node', () => {
  it('passes the seeded chat message through unchanged', async () => {
    const node = makeNode({ name: 'Chat', type: 'chatTrigger' });
    const ctx = makeExecuteFunctions([{ json: { chatInput: 'Hello there' } }], { node });
    const result = await chatTrigger.execute!.call(ctx);
    expect(result).toEqual([[{ json: { chatInput: 'Hello there' } }]]);
  });

  it('declares no inputs (it is a trigger)', () => {
    expect(chatTrigger.description.inputs).toEqual([]);
  });
});
