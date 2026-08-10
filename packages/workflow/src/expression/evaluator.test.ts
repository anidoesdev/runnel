import { describe, expect, it } from 'vitest';
import { evaluateAst, stringifyForTemplate } from './evaluator.js';
import { parseExpressionSource } from './parser.js';
import { ExpressionError } from '../interfaces/errors.js';

function evalExpr(source: string, scope: Record<string, unknown> = {}, maxSteps?: number): unknown {
  const ast = parseExpressionSource(source);
  const resolve = (name: string): unknown => {
    if (!(name in scope)) throw new ExpressionError(`Unknown variable "${name}"`, { nodeName: 'TestNode' });
    return scope[name];
  };
  return evaluateAst(ast, resolve, 'TestNode', maxSteps === undefined ? {} : { maxSteps });
}

describe('evaluateAst — arithmetic and comparison', () => {
  it.each([
    ['1 + 2', 3],
    ['5 - 2', 3],
    ['3 * 4', 12],
    ['10 / 4', 2.5],
    ['10 % 3', 1],
    ['2 ** 10', 1024],
    ['"a" + "b"', 'ab'],
    ['"n=" + 5', 'n=5'],
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
  ])('%s === %j', (src, expected) => {
    expect(evalExpr(src)).toEqual(expected);
  });

  it.each([
    ['1 == "1"', true],
    ['1 === "1"', false],
    ['1 != "1"', false],
    ['1 !== "1"', true],
    ['2 < 3', true],
    ['3 <= 3', true],
    ['3 > 2', true],
    ['3 >= 4', false],
  ])('%s === %j', (src, expected) => {
    expect(evalExpr(src)).toBe(expected);
  });
});

describe('evaluateAst — logical operators short-circuit correctly', () => {
  it('&& returns the first falsy or the last value', () => {
    expect(evalExpr('0 && 5')).toBe(0);
    expect(evalExpr('1 && 5')).toBe(5);
  });

  it('|| returns the first truthy or the last value', () => {
    expect(evalExpr('0 || 5')).toBe(5);
    expect(evalExpr('1 || 5')).toBe(1);
  });

  it('?? only falls through on null/undefined, not other falsy values', () => {
    expect(evalExpr('0 ?? 5')).toBe(0);
    expect(evalExpr('"" ?? 5')).toBe('');
    expect(evalExpr('null ?? 5')).toBe(5);
    expect(evalExpr('undefined ?? 5')).toBe(5);
  });

  it('does not evaluate the right-hand side when short-circuited', () => {
    // referencing an unknown var would throw if evaluated — it must not be reached
    expect(evalExpr('1 || unknownVar')).toBe(1);
    expect(evalExpr('0 && unknownVar')).toBe(0);
  });
});

describe('evaluateAst — ternary and unary', () => {
  it('evaluates a ternary based on the test', () => {
    expect(evalExpr('1 < 2 ? "yes" : "no"')).toBe('yes');
    expect(evalExpr('1 > 2 ? "yes" : "no"')).toBe('no');
  });

  it('evaluates unary !, -, +', () => {
    expect(evalExpr('!true')).toBe(false);
    expect(evalExpr('!0')).toBe(true);
    expect(evalExpr('-5')).toBe(-5);
    expect(evalExpr('+"5"')).toBe(5);
  });
});

describe('evaluateAst — literals, arrays, and objects', () => {
  it('evaluates array literals', () => {
    expect(evalExpr('[1, 2, 3]')).toEqual([1, 2, 3]);
  });

  it('evaluates object literals with computed keys', () => {
    const key = 'dynamic';
    expect(evalExpr('{a: 1, [k]: 2}', { k: key })).toEqual({ a: 1, dynamic: 2 });
  });
});

describe('evaluateAst — member access and calls', () => {
  it('reads nested properties via dot and bracket access', () => {
    const scope = { obj: { a: { b: 42 } } };
    expect(evalExpr('obj.a.b', scope)).toBe(42);
    expect(evalExpr('obj["a"]["b"]', scope)).toBe(42);
  });

  it('calls a plain function resolved from scope', () => {
    expect(evalExpr('fn(1, 2)', { fn: (a: number, b: number) => a + b })).toBe(3);
  });

  it('calls a native method on a resolved value', () => {
    expect(evalExpr('str.toUpperCase()', { str: 'abc' })).toBe('ABC');
  });

  it('supports optional chaining short-circuiting through null/undefined', () => {
    expect(evalExpr('obj?.a?.b', { obj: null })).toBeUndefined();
    expect(evalExpr('obj?.missing?.()', { obj: {} })).toBeUndefined();
  });

  it('throws when reading a property of null or undefined without optional chaining', () => {
    expect(() => evalExpr('obj.a', { obj: null })).toThrow(ExpressionError);
    expect(() => evalExpr('obj.a', { obj: undefined })).toThrow(ExpressionError);
  });

  it('throws when calling a non-function value', () => {
    expect(() => evalExpr('obj.a()', { obj: { a: 5 } })).toThrow(/not a function/);
  });

  it('throws when calling something that is not a function at all', () => {
    expect(() => evalExpr('notAFunction()', { notAFunction: 5 })).toThrow(/non-function/);
  });

  it('throws when calling a method on null or undefined without optional chaining', () => {
    expect(() => evalExpr('obj.foo()', { obj: null })).toThrow(ExpressionError);
    expect(() => evalExpr('obj.foo()', { obj: undefined })).toThrow(/Cannot call method/);
  });
});

describe('evaluateAst — template literals', () => {
  it('concatenates quasis and interpolated expressions', () => {
    expect(evalExpr('`Hello ${name}!`', { name: 'World' })).toBe('Hello World!');
  });

  it('stringifies non-string interpolated values', () => {
    expect(evalExpr('`count: ${n}`', { n: 5 })).toBe('count: 5');
    expect(evalExpr('`data: ${obj}`', { obj: { a: 1 } })).toBe('data: {"a":1}');
    expect(evalExpr('`v: ${v}`', { v: undefined })).toBe('v: ');
    expect(evalExpr('`v: ${v}`', { v: null })).toBe('v: null');
  });
});

describe('stringifyForTemplate', () => {
  it('renders undefined as empty string and null as the literal "null"', () => {
    expect(stringifyForTemplate(undefined)).toBe('');
    expect(stringifyForTemplate(null)).toBe('null');
  });

  it('JSON-stringifies objects and arrays', () => {
    expect(stringifyForTemplate({ a: 1 })).toBe('{"a":1}');
    expect(stringifyForTemplate([1, 2])).toBe('[1,2]');
  });

  it('stringifies primitives with String()', () => {
    expect(stringifyForTemplate(5)).toBe('5');
    expect(stringifyForTemplate(true)).toBe('true');
  });
});

describe('evaluateAst — sandbox escape prevention', () => {
  const blockedAccessors = [
    'x.constructor',
    'x["constructor"]',
    'x.__proto__',
    'x["__proto__"]',
    'x.prototype',
  ];

  it.each(blockedAccessors)('blocks property access to %s', (src) => {
    expect(() => evalExpr(src, { x: {} })).toThrow(/not allowed/);
  });

  it('blocks the classic constructor.constructor escape chain even as a call', () => {
    expect(() => evalExpr('x.constructor.constructor("return 1")()', { x: 'str' })).toThrow(/not allowed/);
  });

  it('cannot reach globals through an unresolvable bare identifier', () => {
    expect(() => evalExpr('process')).toThrow(/Unknown variable/);
    expect(() => evalExpr('globalThis')).toThrow(/Unknown variable/);
    expect(() => evalExpr('require("fs")')).toThrow(/Unknown variable/);
  });
});

describe('evaluateAst — step budget', () => {
  it('throws once the evaluation step budget is exceeded', () => {
    // A wide array literal costs one step per element plus one for the literal itself.
    const wideArray = `[${Array.from({ length: 50 }, (_, i) => i).join(',')}]`;
    expect(() => evalExpr(wideArray, {}, 10)).toThrow(/step budget/);
    expect(evalExpr(wideArray, {}, 1000)).toHaveLength(50);
  });
});
