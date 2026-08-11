import { describe, expect, it } from 'vitest';
import { MapCredentialTypes } from './credential-types.js';

describe('MapCredentialTypes', () => {
  it('returns a registered credential type by name', () => {
    const type = { name: 'apiKeyAuth', displayName: 'API Key', properties: [] };
    const registry = new MapCredentialTypes().register(type);
    expect(registry.getByName('apiKeyAuth')).toBe(type);
  });

  it('throws for an unregistered credential type', () => {
    const registry = new MapCredentialTypes();
    expect(() => registry.getByName('nope')).toThrow(/Unknown credential type/);
  });
});
