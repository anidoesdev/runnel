import { describe, expect, it } from 'vitest';
import { codeNode } from './Code.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Code node', () => {
  it('runs once for all items by default, using $input', async () => {
    const node = makeNode({
      name: 'Code',
      type: 'code',
      parameters: { jsCode: 'return $input.all().map(item => ({ json: { n: item.json.n * 2 } }));' },
    });
    const ctx = makeExecuteFunctions([{ json: { n: 1 } }, { json: { n: 2 } }], { node });
    const result = await codeNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { n: 2 } }, { json: { n: 4 } }]);
  });

  it('runs once per item when mode is runOnceForEachItem', async () => {
    const node = makeNode({
      name: 'Code',
      type: 'code',
      parameters: { mode: 'runOnceForEachItem', jsCode: 'return { doubled: $json.n * 2 };' },
    });
    const ctx = makeExecuteFunctions([{ json: { n: 1 } }, { json: { n: 2 } }], { node });
    const result = await codeNode.execute!.call(ctx);
    expect(result[0]).toEqual([
      { json: { doubled: 2 }, pairedItem: { item: 0 } },
      { json: { doubled: 4 }, pairedItem: { item: 1 } },
    ]);
  });

  it('defaults to empty code when jsCode is not set at all', async () => {
    const node = makeNode({ name: 'Code', type: 'code', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    // Empty code implicitly returns undefined, which runCode rejects for this mode.
    await expect(codeNode.execute!.call(ctx)).rejects.toThrow(/must return an array/);
  });

  it('throws a clear error for an unsupported language', async () => {
    const node = makeNode({ name: 'Code', type: 'code', parameters: { language: 'python', jsCode: '' } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    await expect(codeNode.execute!.call(ctx)).rejects.toThrow(/not supported yet/);
  });

  it('propagates a thrown error from the script', async () => {
    const node = makeNode({ name: 'Code', type: 'code', parameters: { jsCode: 'throw new Error("boom");' } });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    await expect(codeNode.execute!.call(ctx)).rejects.toThrow('boom');
  });
});
