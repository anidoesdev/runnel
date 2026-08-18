import { describe, expect, it } from 'vitest';
import { Bm25Index, tokenize } from './bm25.js';

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric boundaries', () => {
    expect(tokenize('Send a Slack Message!')).toEqual(['send', 'a', 'slack', 'message']);
  });

  it('returns an empty array for a query with no word characters', () => {
    expect(tokenize('...')).toEqual([]);
  });
});

describe('Bm25Index', () => {
  const index = new Bm25Index([
    { id: 'a', text: 'Slack send a message to a channel', payload: 'Slack' },
    { id: 'b', text: 'Postgres run a SQL query against a database', payload: 'Postgres' },
    { id: 'c', text: 'HTTP Request call a REST API endpoint', payload: 'HTTP Request' },
  ]);

  it('ranks the document containing the query terms above unrelated ones', () => {
    const results = index.search('slack message');
    expect(results[0]!.payload).toBe('Slack');
  });

  it('scores a document matching more query terms higher than one matching fewer', () => {
    const results = index.search('sql database query');
    expect(results[0]!.payload).toBe('Postgres');
  });

  it('excludes documents that match none of the query terms', () => {
    const results = index.search('slack message');
    expect(results.map((r) => r.payload)).not.toContain('Postgres');
  });

  it('respects the limit', () => {
    const results = index.search('a', 1);
    expect(results).toHaveLength(1);
  });

  it('returns nothing for a query with no tokens', () => {
    expect(index.search('...')).toEqual([]);
  });

  it('handles an empty corpus without throwing', () => {
    const empty = new Bm25Index<string>([]);
    expect(empty.search('anything')).toEqual([]);
  });
});
