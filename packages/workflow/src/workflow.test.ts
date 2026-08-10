import { describe, expect, it } from 'vitest';
import { Workflow } from './workflow.js';
import type { IWorkflowBase } from './interfaces/workflow.interfaces.js';

describe('Workflow', () => {
  it('looks up a node by name', () => {
    const definition: IWorkflowBase = {
      id: '1',
      name: 'test',
      active: false,
      nodes: [
        {
          id: 'n1',
          name: 'Start',
          type: 'n8n-clone.start',
          typeVersion: 1,
          position: [0, 0],
          parameters: {},
        },
      ],
      connections: {},
    };

    const workflow = new Workflow(definition);

    expect(workflow.getNode('Start')?.id).toBe('n1');
    expect(workflow.getNode('Missing')).toBeUndefined();
  });
});
