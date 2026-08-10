import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from './node-types.js';
import { testNoOpNode } from './test-nodes.js';

describe('MapNodeTypes', () => {
  it('returns a registered node type by name', () => {
    const registry = new MapNodeTypes().register(testNoOpNode);
    expect(registry.getByNameAndVersion('test.noOp')).toBe(testNoOpNode);
  });

  it('throws for an unregistered type', () => {
    const registry = new MapNodeTypes();
    expect(() => registry.getByNameAndVersion('nope')).toThrow(/Unknown node type/);
  });
});
