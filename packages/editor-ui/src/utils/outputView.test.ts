import { describe, expect, it } from 'vitest';
import { inferSchema, tableCell, tableColumns } from './outputView.js';
import type { IDataObject, INodeExecutionData } from '@n8n-clone/workflow';

function items(...jsons: IDataObject[]): INodeExecutionData[] {
  return jsons.map((json) => ({ json }));
}

describe('inferSchema', () => {
  it('infers primitive field types from a single item', () => {
    expect(inferSchema(items({ name: 'Ada', age: 36, active: true, note: null }))).toEqual([
      { path: 'name', type: 'string' },
      { path: 'age', type: 'number' },
      { path: 'active', type: 'boolean' },
      { path: 'note', type: 'null' },
    ]);
  });

  it('flattens nested objects into dot-notation paths', () => {
    expect(inferSchema(items({ user: { name: 'Ada', address: { city: 'London' } } }))).toEqual([
      { path: 'user.name', type: 'string' },
      { path: 'user.address.city', type: 'string' },
    ]);
  });

  it('flattens arrays into bracket-notation paths', () => {
    expect(inferSchema(items({ tags: ['a', 'b'] }))).toEqual([
      { path: 'tags[0]', type: 'string' },
      { path: 'tags[1]', type: 'string' },
    ]);
  });

  it('unions field paths across multiple items without duplicating a path', () => {
    expect(inferSchema(items({ name: 'Ada' }, { name: 'Bob', age: 40 }))).toEqual([
      { path: 'name', type: 'string' },
      { path: 'age', type: 'number' },
    ]);
  });

  it('returns an empty list for items with no fields', () => {
    expect(inferSchema(items({}))).toEqual([]);
  });
});

describe('tableColumns', () => {
  it('collects top-level keys in first-seen order across items', () => {
    expect(tableColumns(items({ name: 'Ada' }, { name: 'Bob', age: 40 }))).toEqual(['name', 'age']);
  });

  it('returns no columns for items with no fields', () => {
    expect(tableColumns(items({}, {}))).toEqual([]);
  });
});

describe('tableCell', () => {
  it('renders primitives as plain strings', () => {
    expect(tableCell({ json: { name: 'Ada', age: 36 } }, 'name')).toBe('Ada');
    expect(tableCell({ json: { name: 'Ada', age: 36 } }, 'age')).toBe('36');
  });

  it('renders null as the literal "null"', () => {
    expect(tableCell({ json: { note: null } }, 'note')).toBe('null');
  });

  it('renders objects and arrays as compact JSON', () => {
    expect(tableCell({ json: { user: { name: 'Ada' } } }, 'user')).toBe('{"name":"Ada"}');
    expect(tableCell({ json: { tags: ['a', 'b'] } }, 'tags')).toBe('["a","b"]');
  });

  it('renders a missing key as blank', () => {
    expect(tableCell({ json: {} }, 'missing')).toBe('');
  });
});
