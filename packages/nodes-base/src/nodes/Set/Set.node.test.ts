import { describe, expect, it } from 'vitest';
import { setNode } from './Set.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

describe('Set (Edit Fields) node', () => {
  it('merges new fields into the existing json by default', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: { fields: { values: [{ name: 'added', type: 'string', value: 'x' }] } },
    });
    const ctx = makeExecuteFunctions([{ json: { existing: 1 } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { existing: 1, added: 'x' }, pairedItem: { item: 0 } }]);
  });

  it('keepOnlySet replaces the item entirely', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: {
        keepOnlySet: true,
        fields: { values: [{ name: 'only', type: 'string', value: 'x' }] },
      },
    });
    const ctx = makeExecuteFunctions([{ json: { existing: 1 } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { only: 'x' }, pairedItem: { item: 0 } }]);
  });

  it('coerces string values to number and boolean per field type', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: {
        fields: {
          values: [
            { name: 'n', type: 'number', value: '42' },
            { name: 'b', type: 'boolean', value: 'true' },
          ],
        },
      },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]![0]!.json).toEqual({ n: 42, b: true });
  });

  it('leaves an already-correctly-typed value (from an expression) untouched', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: {
        fields: {
          values: [
            { name: 'n', type: 'number', value: '={{ $json.n }}' },
            { name: 'b', type: 'boolean', value: '={{ $json.b }}' },
            { name: 's', type: 'string', value: '={{ $json.s }}' },
          ],
        },
      },
    });
    const ctx = makeExecuteFunctions([{ json: { n: 7, b: false, s: 'hi' } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]![0]!.json).toEqual({ n: 7, b: false, s: 'hi' });
  });

  it('evaluates an expression value per item', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: { fields: { values: [{ name: 'doubled', type: 'number', value: '={{ $json.n * 2 }}' }] } },
    });
    const ctx = makeExecuteFunctions([{ json: { n: 3 } }, { json: { n: 5 } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]!.map((item) => item.json.doubled)).toEqual([6, 10]);
  });

  it('json mode sets fields from a raw JSON string', async () => {
    const node = makeNode({
      name: 'Set',
      type: 'set',
      parameters: { mode: 'json', jsonOutput: '{"a": 1, "b": 2}' },
    });
    const ctx = makeExecuteFunctions([{ json: { existing: true } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]![0]!.json).toEqual({ existing: true, a: 1, b: 2 });
  });

  it('defaults to manual mode and no fields when parameters are empty', async () => {
    const node = makeNode({ name: 'Set', type: 'set', parameters: {} });
    const ctx = makeExecuteFunctions([{ json: { existing: 1 } }], { node });
    const result = await setNode.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { existing: 1 }, pairedItem: { item: 0 } }]);
  });
});
