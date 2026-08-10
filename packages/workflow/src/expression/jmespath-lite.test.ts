import { describe, expect, it } from 'vitest';
import { jmespathLite } from './jmespath-lite.js';

describe('jmespathLite', () => {
  it('resolves a simple dot path', () => {
    expect(jmespathLite({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  it('resolves array indexing, including negative indices', () => {
    expect(jmespathLite({ items: [10, 20, 30] }, 'items[0]')).toBe(10);
    expect(jmespathLite({ items: [10, 20, 30] }, 'items[-1]')).toBe(30);
  });

  it('resolves a wildcard projection over an array', () => {
    const data = { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
    expect(jmespathLite(data, 'items[*].name')).toEqual(['a', 'b', 'c']);
  });

  it('drops undefined results from a projection', () => {
    const data = { items: [{ name: 'a' }, {}, { name: 'c' }] };
    expect(jmespathLite(data, 'items[*].name')).toEqual(['a', 'c']);
  });

  it('pipes the result of one stage into the next', () => {
    const data = { items: [{ name: 'a' }, { name: 'b' }] };
    expect(jmespathLite(data, 'items[*].name | [0]')).toBe('a');
  });

  it('returns undefined for a field access on a non-object', () => {
    expect(jmespathLite('a string', 'foo')).toBeUndefined();
    expect(jmespathLite(null, 'foo')).toBeUndefined();
    expect(jmespathLite(undefined, 'foo')).toBeUndefined();
  });

  it('returns undefined for an index access on a non-array', () => {
    expect(jmespathLite({ a: 1 }, 'a[0]')).toBeUndefined();
  });

  it('returns undefined for a wildcard over a non-array', () => {
    expect(jmespathLite({ a: 1 }, 'a[*].x')).toBeUndefined();
  });

  it('returns the whole value for an empty path', () => {
    expect(jmespathLite({ a: 1 }, '')).toEqual({ a: 1 });
  });
});
