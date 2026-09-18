import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { registerAllNodeTypes } from '@runnel/nodes-base';
import { composeSystemPrompt, MAX_CATALOG_ENTRIES, renderNodeCatalog } from './node-catalog.js';
import type { INodeType } from '@runnel/workflow';

function nodeType(name: string): INodeType {
  return {
    description: {
      displayName: name.toUpperCase(),
      name,
      group: ['transform'],
      version: 1,
      description: `does ${name}`,
      defaults: { name },
      inputs: ['main'],
      outputs: ['main'],
      properties: [],
    },
  };
}

describe('renderNodeCatalog', () => {
  it('lists every registered node type by its exact type name, sorted', () => {
    const catalog = renderNodeCatalog(new MapNodeTypes().register(nodeType('zeta')).register(nodeType('alpha')))!;

    expect(catalog).toContain('## Node types available here');
    expect(catalog.indexOf('- `alpha` — ALPHA: does alpha')).toBeLessThan(catalog.indexOf('- `zeta` — ZETA: does zeta'));
  });

  it('covers the real built-in catalog, including the nodes models failed to find by search', () => {
    const catalog = renderNodeCatalog(registerAllNodeTypes(new MapNodeTypes()))!;
    for (const type of ['removeDuplicates', 'renameKeys', 'sort', 'limit', 'lmChatOpenAi', 'webhook']) {
      expect(catalog).toContain(`\`${type}\``);
    }
  });

  it('says nothing for an empty registry or one too large to list usefully', () => {
    expect(renderNodeCatalog(new MapNodeTypes())).toBeUndefined();
    const huge = new MapNodeTypes();
    for (let i = 0; i <= MAX_CATALOG_ENTRIES; i++) huge.register(nodeType(`node${i}`));
    expect(renderNodeCatalog(huge)).toBeUndefined();
  });
});

describe('composeSystemPrompt', () => {
  it('appends the catalog after the base prompt, and leaves the base alone without one', () => {
    const nodeTypes = new MapNodeTypes().register(nodeType('alpha'));
    expect(composeSystemPrompt('BASE', nodeTypes)).toBe(`BASE\n\n${renderNodeCatalog(nodeTypes)}`);
    expect(composeSystemPrompt('BASE', new MapNodeTypes())).toBe('BASE');
  });
});
