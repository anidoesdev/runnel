import { describe, expect, it } from 'vitest';
import { Workflow } from './workflow.js';
import { chain, makeNode, makeWorkflow } from './test-utils.js';
import type { IWorkflowBase } from './interfaces/workflow.interfaces.js';

describe('Workflow.getNode', () => {
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

describe('Workflow.getChildNodes / getParentNodes', () => {
  it('returns the full transitive descendant/ancestor set on a linear chain', () => {
    const nodes = ['A', 'B', 'C', 'D'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, chain(['A', 'B', 'C', 'D'])));

    expect(workflow.getChildNodes('A').sort()).toEqual(['B', 'C', 'D']);
    expect(workflow.getChildNodes('C')).toEqual(['D']);
    expect(workflow.getChildNodes('D')).toEqual([]);

    expect(workflow.getParentNodes('D').sort()).toEqual(['A', 'B', 'C']);
    expect(workflow.getParentNodes('A')).toEqual([]);
  });

  it('deduplicates descendants reachable through both branches of an IF-style split', () => {
    const nodes = ['If', 'True', 'False', 'Merge'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        If: {
          main: [
            [{ node: 'True', type: 'main', index: 0 }],
            [{ node: 'False', type: 'main', index: 0 }],
          ],
        },
        True: { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
        False: { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
      }),
    );

    expect(workflow.getChildNodes('If').sort()).toEqual(['False', 'Merge', 'True']);
  });

  it('respects an explicit depth limit', () => {
    const nodes = ['A', 'B', 'C'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, chain(['A', 'B', 'C'])));

    expect(workflow.getChildNodes('A', 1)).toEqual(['B']);
  });
});
