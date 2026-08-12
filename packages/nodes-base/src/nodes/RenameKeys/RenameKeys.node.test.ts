import { describe, expect, it } from 'vitest';
import { renameKeysNode } from './RenameKeys.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Rename Keys node', () => {
  it('renames the configured keys and leaves others untouched', async () => {
    const node = makeNode({
      name: 'Rename Keys',
      type: 'renameKeys',
      parameters: { renames: { values: [{ from: 'firstName', to: 'first_name' }] } },
    });
    const ctx = makeExecuteFunctions([{ json: { firstName: 'Ada', age: 30 } }], { node });

    const result = await renameKeysNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { first_name: 'Ada', age: 30 }, pairedItem: { item: 0 } }]);
  });

  it('passes items through unchanged when there are no renames', async () => {
    const node = makeNode({ name: 'Rename Keys', type: 'renameKeys', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: { a: 1 } }], { node });

    const result = await renameKeysNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { a: 1 }, pairedItem: { item: 0 } }]);
  });
});
