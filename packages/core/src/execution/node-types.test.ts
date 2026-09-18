import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from './node-types.js';
import { testNoOpNode } from './test-nodes.js';
import type { INodeType, VersionedNodeType } from '@runnel/workflow';

describe('MapNodeTypes', () => {
  it('returns a registered node type by name', () => {
    const registry = new MapNodeTypes().register(testNoOpNode);
    expect(registry.getByNameAndVersion('test.noOp')).toBe(testNoOpNode);
  });

  it('throws for an unregistered type', () => {
    const registry = new MapNodeTypes();
    expect(() => registry.getByNameAndVersion('nope')).toThrow(/Unknown node type/);
  });

  describe('versioned node types', () => {
    const v1: INodeType = { ...testNoOpNode, description: { ...testNoOpNode.description, version: 1 } };
    const v2: INodeType = { ...testNoOpNode, description: { ...testNoOpNode.description, version: 2 } };
    const versioned: VersionedNodeType = {
      nodeVersions: { 1: v1, 2: v2 },
      currentVersion: 2,
      description: { ...testNoOpNode.description, version: [1, 2], defaultVersion: 2 },
    };

    it('resolves the current version when none is requested', () => {
      const registry = new MapNodeTypes().register(versioned);
      expect(registry.getByNameAndVersion('test.noOp')).toBe(v2);
    });

    it('resolves a specific older version when requested', () => {
      const registry = new MapNodeTypes().register(versioned);
      expect(registry.getByNameAndVersion('test.noOp', 1)).toBe(v1);
    });

    it('throws for a version that was never registered', () => {
      const registry = new MapNodeTypes().register(versioned);
      expect(() => registry.getByNameAndVersion('test.noOp', 99)).toThrow(/Unknown version 99/);
    });
  });

  describe('list', () => {
    it('returns the top-level description of every registered type, unversioned or not', () => {
      const other: INodeType = { ...testNoOpNode, description: { ...testNoOpNode.description, name: 'test.other' } };
      const versioned: VersionedNodeType = {
        nodeVersions: { 1: testNoOpNode },
        currentVersion: 1,
        description: { ...testNoOpNode.description, name: 'test.versioned', version: [1], defaultVersion: 1 },
      };
      const registry = new MapNodeTypes().register(testNoOpNode).register(other).register(versioned);

      expect(registry.list().map((d) => d.name).sort()).toEqual(['test.noOp', 'test.other', 'test.versioned']);
    });

    it('returns an empty list for an empty registry', () => {
      expect(new MapNodeTypes().list()).toEqual([]);
    });
  });
});
