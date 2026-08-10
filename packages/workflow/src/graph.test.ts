import { describe, expect, it } from 'vitest';
import { NodeGraph } from './graph.js';
import type { IConnections } from './interfaces/workflow.interfaces.js';

const conn = (from: string, ...to: string[]): IConnections => ({
  [from]: { main: [to.map((node) => ({ node, type: 'main' as const, index: 0 }))] },
});

const merge = (edges: IConnections[]): IConnections => Object.assign({}, ...edges);

describe('NodeGraph', () => {
  it('resolves forward and backward reachability on a linear chain', () => {
    const graph = new NodeGraph(['A', 'B', 'C'], merge([conn('A', 'B'), conn('B', 'C')]));

    expect(graph.reachable('A', 'forward')).toEqual(expect.arrayContaining(['B', 'C']));
    expect(graph.reachable('A', 'forward')).toHaveLength(2);
    expect(graph.reachable('C', 'backward')).toEqual(expect.arrayContaining(['A', 'B']));
  });

  it('deduplicates diamond-shaped reachability (branch then merge)', () => {
    // A -> B, A -> C, B -> D, C -> D
    const graph = new NodeGraph(
      ['A', 'B', 'C', 'D'],
      merge([conn('A', 'B', 'C'), conn('B', 'D'), conn('C', 'D')]),
    );

    expect(graph.reachable('A', 'forward').sort()).toEqual(['B', 'C', 'D']);
    expect(graph.reachable('D', 'backward').sort()).toEqual(['A', 'B', 'C']);
  });

  it('respects a depth limit', () => {
    const graph = new NodeGraph(['A', 'B', 'C'], merge([conn('A', 'B'), conn('B', 'C')]));
    expect(graph.reachable('A', 'forward', 1)).toEqual(['B']);
  });

  it('finds a single strongly-connected component for a self-loop', () => {
    const graph = new NodeGraph(['A'], conn('A', 'A'));
    const sccs = graph.stronglyConnectedComponents();
    expect(sccs).toEqual([['A']]);
    expect(graph.children('A')).toContain('A');
  });

  it('groups a multi-node loop into one strongly-connected component', () => {
    // A -> B -> C -> B  (B and C form a cycle, A feeds into it)
    const graph = new NodeGraph(['A', 'B', 'C'], merge([conn('A', 'B'), conn('B', 'C'), conn('C', 'B')]));
    const sccs = graph.stronglyConnectedComponents();

    const bcComponent = sccs.find((c) => c.includes('B'));
    expect(bcComponent?.sort()).toEqual(['B', 'C']);
    expect(sccs.find((c) => c.includes('A'))).toEqual(['A']);
  });

  it('treats every node as its own component when the graph is acyclic', () => {
    const graph = new NodeGraph(['A', 'B', 'C'], merge([conn('A', 'B', 'C')]));
    const sccs = graph.stronglyConnectedComponents();
    expect(sccs.map((c) => c.length)).toEqual([1, 1, 1]);
  });

  it('returns an empty array from children/parents for a name that was never registered', () => {
    const graph = new NodeGraph(['A'], {});
    expect(graph.children('Unknown')).toEqual([]);
    expect(graph.parents('Unknown')).toEqual([]);
  });

  it('tolerates a connection that references nodes outside the declared node list', () => {
    // Malformed input (stale connections pointing at deleted nodes) must not throw — both
    // endpoints become traversable adjacency even when neither was in nodeNames.
    const graph = new NodeGraph(['A'], conn('A', 'Ghost'));
    expect(graph.children('A')).toEqual(['Ghost']);
    expect(graph.parents('Ghost')).toEqual(['A']);

    const orphanGraph = new NodeGraph([], conn('GhostSource', 'GhostTarget'));
    expect(orphanGraph.children('GhostSource')).toEqual(['GhostTarget']);
    expect(orphanGraph.parents('GhostTarget')).toEqual(['GhostSource']);
  });
});
