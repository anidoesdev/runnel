import { describe, expect, it } from 'vitest';
import { MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { allCredentialTypes, allNodeTypes, registerAllCredentialTypes, registerAllNodeTypes } from './index.js';

describe('registerAllNodeTypes', () => {
  it('registers all built-in node types under their declared names', () => {
    const registry = registerAllNodeTypes(new MapNodeTypes());
    for (const nodeType of allNodeTypes) {
      expect(registry.getByNameAndVersion(nodeType.description.name)).toBe(nodeType);
    }
  });

  it('exposes the nine M5 nodes, the three M7 trigger nodes, and the seven M9 nodes', () => {
    const names = allNodeTypes.map((n) => n.description.name).sort();
    expect(names).toEqual(
      [
        'code',
        'httpRequest',
        'if',
        'manualTrigger',
        'merge',
        'noOp',
        'pollTrigger',
        'scheduleTrigger',
        'set',
        'splitInBatches',
        'start',
        'webhook',
        'switch',
        'filter',
        'sort',
        'limit',
        'removeDuplicates',
        'renameKeys',
        'postgres',
      ].sort(),
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

  it('exposes the five M5 credential types plus the M9 postgresApi type', () => {
    const names = allCredentialTypes.map((c) => c.name).sort();
    expect(names).toEqual(
      ['httpBasicAuth', 'httpBearerAuth', 'httpHeaderAuth', 'httpQueryAuth', 'oAuth2Api', 'postgresApi'].sort(),
    );
  });
});
