import { describe, expect, it } from 'vitest';
import { getLoadedPackages } from './index.js';

describe('getLoadedPackages', () => {
  it('lists the nodes-base package', () => {
    expect(getLoadedPackages()).toContain('@n8n-clone/nodes-base');
  });
});
