import { describe, expect, it } from 'vitest';
import { MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { allCredentialTypes, allNodeTypes, registerAllCredentialTypes, registerAllNodeTypes } from './index.js';

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

describe('registerAllCredentialTypes', () => {
  it('registers every built-in credential type under its declared name', () => {
    const registry = registerAllCredentialTypes(new MapCredentialTypes());
    for (const credentialType of allCredentialTypes) {
      expect(registry.getByName(credentialType.name)).toBe(credentialType);
    }
  });

  it('exposes the five M5 credential types', () => {
    const names = allCredentialTypes.map((c) => c.name).sort();
    expect(names).toEqual(['httpBasicAuth', 'httpBearerAuth', 'httpHeaderAuth', 'httpQueryAuth', 'oAuth2Api'].sort());
  });
});
