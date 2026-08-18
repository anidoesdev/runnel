import { describe, expect, it } from 'vitest';
import { searchNodeTypes } from './search-nodes.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

function description(overrides: Partial<INodeTypeDescription>): INodeTypeDescription {
  return {
    displayName: 'Test Node',
    name: 'test.node',
    group: ['transform'],
    version: 1,
    description: 'A test node',
    defaults: { name: 'Test Node' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    ...overrides,
  };
}

const postgres = description({ name: 'postgres', displayName: 'Postgres', description: 'Runs a SQL query against a Postgres database', group: ['transform'] });
const httpRequest = description({ name: 'httpRequest', displayName: 'HTTP Request', description: 'Makes an HTTP request', group: ['transform'] });
const catalog = [postgres, httpRequest];

describe('searchNodeTypes', () => {
  it('ranks by relevance and includes the shaped fields', () => {
    const results = searchNodeTypes(catalog, 'postgres database');
    expect(results[0]).toMatchObject({ type: 'postgres', displayName: 'Postgres', category: 'transform' });
    expect(results[0]!.score).toBeGreaterThan(0);
  });

  it('matches via a hand-seeded alias that appears in neither displayName nor description', () => {
    const results = searchNodeTypes(catalog, 'db');
    expect(results[0]?.type).toBe('postgres');
  });

  it('matches a brand-name-style query for the http node via its alias table', () => {
    const results = searchNodeTypes(catalog, 'call an api');
    expect(results[0]?.type).toBe('httpRequest');
  });

  it('respects the limit parameter', () => {
    expect(searchNodeTypes(catalog, 'a', 1)).toHaveLength(1);
  });

  it('returns an empty array when nothing matches', () => {
    expect(searchNodeTypes(catalog, 'xyzzy_no_match')).toEqual([]);
  });
});
