import { describe, expect, it } from 'vitest';
import { describeWorkflow } from './index.js';

describe('describeWorkflow', () => {
  it('summarizes a workflow', () => {
    const summary = describeWorkflow({
      id: '1',
      name: 'My Workflow',
      active: false,
      nodes: [],
      connections: {},
    });

    expect(summary).toBe('My Workflow (0 nodes)');
  });
});
