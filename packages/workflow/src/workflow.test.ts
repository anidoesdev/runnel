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

describe('Workflow.pruneToDestination', () => {
  it('keeps only the destination node and its ancestors on a linear chain, dropping anything downstream', () => {
    const nodes = ['A', 'B', 'C', 'D'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, chain(['A', 'B', 'C', 'D'])));

    const pruned = workflow.pruneToDestination('C');

    expect(pruned.nodes.map((n) => n.name).sort()).toEqual(['A', 'B', 'C']);
    expect(pruned.connections.C).toBeUndefined(); // C's own outgoing edge (to D) is dropped
    expect(pruned.connections.A?.main[0]).toEqual([{ node: 'B', type: 'main', index: 0 }]);
    expect(pruned.connections.B?.main[0]).toEqual([{ node: 'C', type: 'main', index: 0 }]);
  });

  it('drops a sibling branch that never reaches the destination', () => {
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

    // Only the True branch leads to the requested destination — False is unrelated to it.
    const pruned = workflow.pruneToDestination('True');

    expect(pruned.nodes.map((n) => n.name).sort()).toEqual(['If', 'True']);
    expect(pruned.connections.If?.main[0]).toEqual([{ node: 'True', type: 'main', index: 0 }]);
    expect(pruned.connections.If?.main[1]).toEqual([]); // the False branch is pruned out
  });

  it('a destination with no ancestors (e.g. the trigger itself) prunes to just that one node', () => {
    const nodes = ['A', 'B'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, chain(['A', 'B'])));

    const pruned = workflow.pruneToDestination('A');
    expect(pruned.nodes.map((n) => n.name)).toEqual(['A']);
    expect(pruned.connections).toEqual({});
  });

  it('throws for an unknown destination node', () => {
    const nodes = [makeNode({ name: 'A' })];
    const workflow = new Workflow(makeWorkflow(nodes, {}));
    expect(() => workflow.pruneToDestination('Missing')).toThrow(/not found/);
  });

  it('does not mutate the original definition', () => {
    const nodes = ['A', 'B', 'C'].map((name) => makeNode({ name }));
    const definition = makeWorkflow(nodes, chain(['A', 'B', 'C']));
    const workflow = new Workflow(definition);

    workflow.pruneToDestination('B');
    expect(definition.nodes.map((n) => n.name)).toEqual(['A', 'B', 'C']);
  });
});
