import { describe, expect, it } from 'vitest';
import { NODES_BASE_PACKAGE } from './index.js';

describe('nodes-base package', () => {
  it('exposes its package identifier', () => {
    expect(NODES_BASE_PACKAGE).toBe('@n8n-clone/nodes-base');
  });
});
