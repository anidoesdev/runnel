import { describe, expect, it } from 'vitest';
import { evaluateExpressionString, isExpression } from './template.js';
import { makeExpressionContext } from './test-utils.js';

describe('isExpression', () => {
  it('is true only for strings starting with "="', () => {
    expect(isExpression('=1+1')).toBe(true);
    expect(isExpression('plain text')).toBe(false);
    expect(isExpression('')).toBe(false);
  });
});

describe('evaluateExpressionString — non-expression passthrough', () => {
  it('returns non-"=" strings unchanged', () => {
    const ctx = makeExpressionContext();
    expect(evaluateExpressionString('hello world', ctx)).toBe('hello world');
    expect(evaluateExpressionString('$node["Old"] is just text here', ctx)).toBe(
      '$node["Old"] is just text here',
    );
  });
});

describe('evaluateExpressionString — whole-body single expression returns the raw value', () => {
  it('preserves object/array/number types instead of stringifying', () => {
    const ctx = makeExpressionContext({ item: { json: { user: { name: 'Ada' }, count: 3 } } });
    expect(evaluateExpressionString('={{ $json.user }}', ctx)).toEqual({ name: 'Ada' });
    expect(evaluateExpressionString('={{ $json.count }}', ctx)).toBe(3);
    expect(evaluateExpressionString('={{ [1,2,3] }}', ctx)).toEqual([1, 2, 3]);
  });

  it('tolerates surrounding whitespace-only text around the single block', () => {
    const ctx = makeExpressionContext({ item: { json: { count: 3 } } });
    expect(evaluateExpressionString('=  {{ $json.count }}  ', ctx)).toBe(3);
  });
});

describe('evaluateExpressionString — mixed text and expressions stringify and concatenate', () => {
  it('concatenates literal text with one interpolated value', () => {
    const ctx = makeExpressionContext({ item: { json: { name: 'World' } } });
    expect(evaluateExpressionString('=Hello {{ $json.name }}!', ctx)).toBe('Hello World!');
  });

  it('concatenates multiple interpolations', () => {
    const ctx = makeExpressionContext({ item: { json: { first: 'A', last: 'B' } } });
    expect(evaluateExpressionString('={{ $json.first }} {{ $json.last }}', ctx)).toBe('A B');
  });

  it('JSON-stringifies an object result when mixed with literal text', () => {
    const ctx = makeExpressionContext({ item: { json: { user: { name: 'Ada' } } } });
    expect(evaluateExpressionString('=user: {{ $json.user }}', ctx)).toBe('user: {"name":"Ada"}');
  });
});

describe('evaluateExpressionString — object literal blocks do not get truncated at nested braces', () => {
  it('correctly finds the closing }} past a nested object literal', () => {
    const ctx = makeExpressionContext();
    expect(evaluateExpressionString('={{ {a: {b: 1}} }}', ctx)).toEqual({ a: { b: 1 } });
  });

  it('handles a brace character inside a string literal within the expression', () => {
    const ctx = makeExpressionContext();
    expect(evaluateExpressionString('={{ "a}b" }}', ctx)).toBe('a}b');
  });
});

describe('evaluateExpressionString — error propagation', () => {
  it('propagates a parse error for malformed expression syntax', () => {
    const ctx = makeExpressionContext();
    expect(() => evaluateExpressionString('={{ 1 + }}', ctx)).toThrow();
  });

  it('propagates an evaluation error (e.g. unknown symbol)', () => {
    const ctx = makeExpressionContext();
    expect(() => evaluateExpressionString('={{ $doesNotExist }}', ctx)).toThrow(/Unknown variable/);
  });

  it('throws when a "{{" block is never closed', () => {
    const ctx = makeExpressionContext();
    expect(() => evaluateExpressionString('=Hello {{ $json.name', ctx)).toThrow(/Unterminated/);
  });
});
