import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { categoryOf, getExtension } from './extensions.js';
import { evaluateAst } from './evaluator.js';
import { parseExpressionSource } from './parser.js';

function evalExpr(source: string, scope: Record<string, unknown> = {}): unknown {
  const ast = parseExpressionSource(source);
  return evaluateAst(ast, (name) => scope[name], 'TestNode');
}

describe('categoryOf', () => {
  it('classifies each runtime type', () => {
    expect(categoryOf('x')).toBe('string');
    expect(categoryOf(1)).toBe('number');
    expect(categoryOf([1])).toBe('array');
    expect(categoryOf({ a: 1 })).toBe('object');
    expect(categoryOf(DateTime.now())).toBe('datetime');
    expect(categoryOf(true)).toBeUndefined();
    expect(categoryOf(null)).toBeUndefined();
    expect(categoryOf(undefined)).toBeUndefined();
  });
});

describe('string extensions', () => {
  it('toSnakeCase converts camelCase and space-separated text', () => {
    expect(getExtension('helloWorld', 'toSnakeCase')!('helloWorld', [])).toBe('hello_world');
    expect(getExtension('Hello World', 'toSnakeCase')!('Hello World', [])).toBe('hello_world');
  });

  it('extractEmail pulls the first email out of free text, or empty string', () => {
    expect(getExtension('', 'extractEmail')!('contact us at a.b+tag@example.co.uk please', [])).toBe(
      'a.b+tag@example.co.uk',
    );
    expect(getExtension('', 'extractEmail')!('no email here', [])).toBe('');
  });

  it('isEmpty checks string length', () => {
    expect(getExtension('', 'isEmpty')!('', [])).toBe(true);
    expect(getExtension('', 'isEmpty')!('x', [])).toBe(false);
  });

  it('toDateTime parses ISO by default and a custom format when given', () => {
    const iso = getExtension('', 'toDateTime')!('2024-01-15', []) as DateTime;
    expect(iso.isValid).toBe(true);
    expect(iso.year).toBe(2024);

    const custom = getExtension('', 'toDateTime')!('15/01/2024', ['dd/MM/yyyy']) as DateTime;
    expect(custom.isValid).toBe(true);
    expect(custom.year).toBe(2024);
  });

  it('is reachable end to end through the evaluator', () => {
    expect(evalExpr('s.toSnakeCase()', { s: 'fooBar' })).toBe('foo_bar');
  });
});

describe('array extensions', () => {
  it('first / last', () => {
    expect(getExtension([], 'first')!([1, 2, 3], [])).toBe(1);
    expect(getExtension([], 'last')!([1, 2, 3], [])).toBe(3);
  });

  it('pluck extracts a field from each object', () => {
    const arr = [{ id: 1 }, { id: 2 }];
    expect(getExtension([], 'pluck')!(arr, ['id'])).toEqual([1, 2]);
  });

  it('unique dedupes by value, or by key when given', () => {
    expect(getExtension([], 'unique')!([1, 1, 2, 2, 3], [])).toEqual([1, 2, 3]);
    const arr = [{ id: 1 }, { id: 1 }, { id: 2 }];
    expect(getExtension([], 'unique')!(arr, ['id'])).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('sum adds numbers, or a field across objects', () => {
    expect(getExtension([], 'sum')!([1, 2, 3], [])).toBe(6);
    const arr = [{ n: 1 }, { n: 2 }, { n: 'not a number' }];
    expect(getExtension([], 'sum')!(arr, ['n'])).toBe(3);
  });

  it('chunk splits into groups of the given size', () => {
    expect(getExtension([], 'chunk')!([1, 2, 3, 4, 5], [2])).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('chunk falls back to a single chunk for a non-positive size', () => {
    expect(getExtension([], 'chunk')!([1, 2], [0])).toEqual([[1, 2]]);
  });

  it('is reachable end to end through the evaluator', () => {
    expect(evalExpr('arr.first()', { arr: [9, 8, 7] })).toBe(9);
    expect(evalExpr('arr.sum()', { arr: [1, 2, 3] })).toBe(6);
  });
});

describe('object extensions', () => {
  it('keys returns own enumerable keys', () => {
    expect(getExtension({}, 'keys')!({ a: 1, b: 2 }, [])).toEqual(['a', 'b']);
  });

  it('hasField checks own-property presence', () => {
    expect(getExtension({}, 'hasField')!({ a: 1 }, ['a'])).toBe(true);
    expect(getExtension({}, 'hasField')!({ a: 1 }, ['b'])).toBe(false);
  });

  it('removeFieldsContaining drops fields whose stringified value contains the substring', () => {
    const obj = { name: 'secret-token-123', count: 5 };
    expect(getExtension({}, 'removeFieldsContaining')!(obj, ['secret'])).toEqual({ count: 5 });
  });

  it('is reachable end to end through the evaluator', () => {
    expect(evalExpr('obj.keys()', { obj: { x: 1, y: 2 } })).toEqual(['x', 'y']);
  });
});

describe('number extensions', () => {
  it('round rounds to the given number of decimals', () => {
    expect(getExtension(0, 'round')!(3.14159, [2])).toBe(3.14);
    expect(getExtension(0, 'round')!(3.6, [])).toBe(4);
  });

  it('format renders using Intl.NumberFormat', () => {
    expect(getExtension(0, 'format')!(1234, ['en-US'])).toBe('1,234');
  });

  it('is reachable end to end through the evaluator', () => {
    expect(evalExpr('n.round(1)', { n: 2.25 })).toBe(2.3);
  });
});

describe('datetime extensions', () => {
  const dt = DateTime.fromISO('2024-06-15T12:00:00Z', { zone: 'utc' });

  it('plus / minus add and subtract a unit', () => {
    expect((getExtension(dt, 'plus')!(dt, [1, 'days']) as DateTime).toISODate()).toBe('2024-06-16');
    expect((getExtension(dt, 'minus')!(dt, [1, 'days']) as DateTime).toISODate()).toBe('2024-06-14');
  });

  it('beginningOf truncates to the start of a unit', () => {
    expect((getExtension(dt, 'beginningOf')!(dt, ['month']) as DateTime).toISODate()).toBe('2024-06-01');
  });

  it('format renders with a Luxon format string', () => {
    expect(getExtension(dt, 'format')!(dt, ['yyyy-MM-dd'])).toBe('2024-06-15');
  });

  it('is reachable end to end through the evaluator', () => {
    expect(evalExpr('d.format("yyyy")', { d: dt })).toBe('2024');
  });
});

describe('getExtension', () => {
  it('returns undefined for an unsupported category or unknown method name', () => {
    expect(getExtension(true, 'anything')).toBeUndefined();
    expect(getExtension('x', 'notARealMethod')).toBeUndefined();
  });
});
