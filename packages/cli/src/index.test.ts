import { describe, expect, it } from 'vitest';
import { getLoadedNodeTypeNames } from './index.js';

describe('getLoadedNodeTypeNames', () => {
  it('lists the built-in node type names', () => {
    expect(getLoadedNodeTypeNames()).toContain('httpRequest');
    expect(getLoadedNodeTypeNames()).toHaveLength(23);
  });
});
