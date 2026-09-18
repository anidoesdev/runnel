import { describe, expect, it } from 'vitest';
import { runCode } from './sandbox.js';

describe('runCode — runOnceForAllItems', () => {
  it('maps over `items` and returns a new array', async () => {
    const result = await runCode({
      mode: 'runOnceForAllItems',
      items: [{ json: { n: 1 } }, { json: { n: 2 } }],
      code: 'return items.map(item => ({ json: { doubled: item.json.n * 2 } }));',
    });
    expect(result).toEqual([{ json: { doubled: 2 } }, { json: { doubled: 4 } }]);
  });

  it('wraps a plain-object return value in { json }', async () => {
    const result = await runCode({
      mode: 'runOnceForAllItems',
      items: [{ json: {} }],
      code: 'return [{ a: 1 }, { a: 2 }];',
    });
    expect(result).toEqual([
      { json: { a: 1 }, pairedItem: { item: 0 } },
      { json: { a: 2 }, pairedItem: { item: 1 } },
    ]);
  });

  it('exposes $input.all()/.first()/.last()', async () => {
    const result = await runCode({
      mode: 'runOnceForAllItems',
      items: [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }],
      code: 'return [{ json: { first: $input.first().json.n, last: $input.last().json.n, count: $input.all().length } }];',
    });
    expect(result).toEqual([{ json: { first: 1, last: 3, count: 3 } }]);
  });

  it('throws a clear error when the return value is not an array', async () => {
    await expect(
      runCode({ mode: 'runOnceForAllItems', items: [{ json: {} }], code: 'return { not: "an array" };' }),
    ).rejects.toThrow(/must return an array/);
  });

  it('propagates a thrown error from user code', async () => {
    await expect(
      runCode({ mode: 'runOnceForAllItems', items: [{ json: {} }], code: 'throw new Error("boom");' }),
    ).rejects.toThrow('boom');
  });
});

describe('runCode — runOnceForEachItem', () => {
  it('runs once per item with $json bound to that item', async () => {
    const result = await runCode({
      mode: 'runOnceForEachItem',
      items: [{ json: { n: 1 } }, { json: { n: 2 } }],
      code: 'return { doubled: $json.n * 2 };',
    });
    expect(result).toEqual([
      { json: { doubled: 2 }, pairedItem: { item: 0 } },
      { json: { doubled: 4 }, pairedItem: { item: 1 } },
    ]);
  });

  it('exposes $itemIndex and $input.item for the current item', async () => {
    const result = await runCode({
      mode: 'runOnceForEachItem',
      items: [{ json: { n: 10 } }, { json: { n: 20 } }],
      code: 'return { index: $itemIndex, viaInput: $input.item.json.n };',
    });
    expect(result).toEqual([
      { json: { index: 0, viaInput: 10 }, pairedItem: { item: 0 } },
      { json: { index: 1, viaInput: 20 }, pairedItem: { item: 1 } },
    ]);
  });

  it('preserves an already-shaped { json } return value as-is', async () => {
    const result = await runCode({
      mode: 'runOnceForEachItem',
      items: [{ json: { n: 1 } }],
      code: 'return { json: { n: $json.n }, pairedItem: { item: 0 } };',
    });
    expect(result).toEqual([{ json: { n: 1 }, pairedItem: { item: 0 } }]);
  });
});

describe('runCode — sandbox isolation', () => {
  it('has no access to Node globals like process or require', async () => {
    const result = await runCode({
      mode: 'runOnceForAllItems',
      items: [{ json: {} }],
      code: 'return [{ json: { hasProcess: typeof process !== "undefined", hasRequire: typeof require !== "undefined" } }];',
    });
    expect(result[0]!.json).toEqual({ hasProcess: false, hasRequire: false });
  });

  it('does not share variables between separate runCode calls', async () => {
    await runCode({ mode: 'runOnceForAllItems', items: [{ json: {} }], code: 'globalThis.leaked = 1; return [];' });
    const result = await runCode({
      mode: 'runOnceForAllItems',
      items: [{ json: {} }],
      code: 'return [{ json: { leaked: typeof leaked !== "undefined" } }];',
    });
    expect(result[0]!.json.leaked).toBe(false);
  });
});

describe('runCode — timeouts', () => {
  it('terminates a synchronous infinite loop once the timeout elapses', async () => {
    await expect(
      runCode({
        mode: 'runOnceForAllItems',
        items: [{ json: {} }],
        code: 'while (true) {}',
        timeoutMs: 50,
      }),
    ).rejects.toThrow(/exceeded 50ms/);
  });

  it('rejects on timeout even for async code that keeps running past it (documented caveat)', async () => {
    await expect(
      runCode({
        mode: 'runOnceForAllItems',
        items: [{ json: {} }],
        code: 'await new Promise((r) => setTimeout(r, 200)); return [];',
        timeoutMs: 20,
      }),
    ).rejects.toThrow(/exceeded 20ms/);
  });
});
