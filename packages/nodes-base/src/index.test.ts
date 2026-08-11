import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@n8n-clone/core';
import { allNodeTypes, registerAllNodeTypes } from './index.js';

describe('registerAllNodeTypes', () => {
  it('registers all nine M5 node types under their declared names', () => {
    const registry = registerAllNodeTypes(new MapNodeTypes());
    for (const nodeType of allNodeTypes) {
      expect(registry.getByNameAndVersion(nodeType.description.name)).toBe(nodeType);
    }
  });

  it('exposes exactly the nine nodes required by the M5 milestone', () => {
    const names = allNodeTypes.map((n) => n.description.name).sort();
    expect(names).toEqual(
      ['code', 'httpRequest', 'if', 'manualTrigger', 'merge', 'noOp', 'set', 'splitInBatches', 'start'].sort(),
    );
  });
});
