import { describe, expect, it } from 'vitest';
import { diffFields, humanizeToolCall } from './assistantDisplay.js';

describe('humanizeToolCall', () => {
  it('humanizes add_node differently while running vs once it has a result', () => {
    expect(humanizeToolCall('add_node', { type: 'httpRequest' }, undefined, true)).toBe('Adding a httpRequest node…');
    expect(humanizeToolCall('add_node', { type: 'httpRequest' }, { name: 'Call API' }, false)).toBe('Added node "Call API"');
  });

  it('humanizes connect_nodes with both endpoints', () => {
    expect(humanizeToolCall('connect_nodes', { from: 'A', to: 'B' }, {}, false)).toBe('Connected "A" → "B"');
  });

  it('humanizes search_nodes with the query', () => {
    expect(humanizeToolCall('search_nodes', { query: 'send a slack message' }, [], false)).toBe('Searched for "send a slack message"');
  });

  it('falls back to the raw tool name for anything unrecognized', () => {
    expect(humanizeToolCall('some_future_tool', {}, {}, false)).toBe('some_future_tool');
  });

  it('never throws on missing/malformed args or result', () => {
    expect(() => humanizeToolCall('add_node', undefined, undefined, false)).not.toThrow();
    expect(() => humanizeToolCall('connect_nodes', null, null, false)).not.toThrow();
  });
});

describe('diffFields', () => {
  it('reports only the keys that actually changed', () => {
    const fields = diffFields({ a: 1, b: 2, c: 3 }, { a: 1, b: 5, d: 4 });
    expect(fields.sort((x, y) => x.key.localeCompare(y.key))).toEqual([
      { key: 'b', before: 2, after: 5 },
      { key: 'c', before: 3, after: undefined },
      { key: 'd', before: undefined, after: 4 },
    ]);
  });

  it('returns nothing for identical objects', () => {
    expect(diffFields({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
