import { describe, expect, it } from 'vitest';
import { Workflow } from './workflow.js';
import { makeNode, makeWorkflow } from './test-utils.js';

const isIterationNode = (type: string): boolean => type === 'runnel.splitInBatches';

describe('Workflow.detectIllegalCycles', () => {
  it('reports no cycles for a DAG (linear, branching, merging)', () => {
    const nodes = ['Start', 'A', 'B', 'Merge'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        Start: {
          main: [[{ node: 'A', type: 'main', index: 0 }, { node: 'B', type: 'main', index: 0 }]],
        },
        A: { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
        B: { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
      }),
    );

    expect(workflow.detectIllegalCycles(isIterationNode)).toEqual([]);
  });

  it('rejects a two-node cycle with no iteration node in it', () => {
    const nodes = ['A', 'B'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
        B: { main: [[{ node: 'A', type: 'main', index: 0 }]] },
      }),
    );

    const illegal = workflow.detectIllegalCycles(isIterationNode);
    expect(illegal).toHaveLength(1);
    expect(illegal[0]!.nodes.sort()).toEqual(['A', 'B']);
  });

  it('accepts a cycle that contains a Loop Over Items / SplitInBatches node', () => {
    const nodes = [
      makeNode({ name: 'Loop', type: 'runnel.splitInBatches' }),
      makeNode({ name: 'Body' }),
    ];
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        Loop: { main: [[{ node: 'Body', type: 'main', index: 0 }]] },
        Body: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] },
      }),
    );

    expect(workflow.detectIllegalCycles(isIterationNode)).toEqual([]);
  });

  it('rejects a self-loop on a plain node', () => {
    const nodes = [makeNode({ name: 'A' })];
    const workflow = new Workflow(
      makeWorkflow(nodes, { A: { main: [[{ node: 'A', type: 'main', index: 0 }]] } }),
    );

    const illegal = workflow.detectIllegalCycles(isIterationNode);
    expect(illegal).toEqual([{ nodes: ['A'] }]);
  });

  it('accepts a self-loop on an iteration node', () => {
    const nodes = [makeNode({ name: 'Loop', type: 'runnel.splitInBatches' })];
    const workflow = new Workflow(
      makeWorkflow(nodes, { Loop: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] } }),
    );

    expect(workflow.detectIllegalCycles(isIterationNode)).toEqual([]);
  });

  it('defaults to treating no node as an iteration node when no predicate is given', () => {
    const nodes = ['A', 'B'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
        B: { main: [[{ node: 'A', type: 'main', index: 0 }]] },
      }),
    );

    expect(workflow.detectIllegalCycles()).toHaveLength(1);
  });
});
