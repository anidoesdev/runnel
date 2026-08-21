import { describe, expect, it } from 'vitest';
import { layoutWorkflow } from './workflow-layout.js';
import type { IWorkflowBase, INode } from '@n8n-clone/workflow';

function node(name: string): INode {
  return { id: name, name, type: 'test.noOp', typeVersion: 1, position: [0, 0], parameters: {} };
}

function workflow(nodes: INode[], connections: IWorkflowBase['connections']): IWorkflowBase {
  return { id: 'wf-1', name: 'Test', active: false, nodes, connections };
}

function posOf(wf: IWorkflowBase, name: string): [number, number] {
  return wf.nodes.find((n) => n.name === name)!.position;
}

describe('layoutWorkflow', () => {
  it('places a linear chain left to right at a constant height', () => {
    const wf = layoutWorkflow(
      workflow(
        [node('A'), node('B'), node('C')],
        {
          A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
        },
      ),
    );
    const [ax] = posOf(wf, 'A');
    const [bx] = posOf(wf, 'B');
    const [cx] = posOf(wf, 'C');
    expect(bx).toBeGreaterThan(ax);
    expect(cx).toBeGreaterThan(bx);
    expect(posOf(wf, 'A')[1]).toBe(posOf(wf, 'B')[1]);
    expect(posOf(wf, 'B')[1]).toBe(posOf(wf, 'C')[1]);
  });

  it('stacks parallel branches at the same depth vertically, not on top of each other', () => {
    const wf = layoutWorkflow(
      workflow(
        [node('A'), node('B'), node('C')],
        { A: { main: [[{ node: 'B', type: 'main', index: 0 }, { node: 'C', type: 'main', index: 0 }]] } },
      ),
    );
    const [bx, by] = posOf(wf, 'B');
    const [cx, cy] = posOf(wf, 'C');
    expect(bx).toBe(cx); // same depth
    expect(by).not.toBe(cy); // distinct rows, not overlapping
  });

  it('computes a merge target\'s depth as one past its deepest predecessor', () => {
    const wf = layoutWorkflow(
      workflow(
        [node('A'), node('B'), node('C'), node('D')],
        {
          A: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
          B: { main: [[{ node: 'C', type: 'main', index: 1 }]] },
          C: { main: [[{ node: 'D', type: 'main', index: 0 }]] },
        },
      ),
    );
    const [ax] = posOf(wf, 'A');
    const [cx] = posOf(wf, 'C');
    const [dx] = posOf(wf, 'D');
    expect(cx).toBeGreaterThan(ax);
    expect(dx).toBeGreaterThan(cx);
  });

  it('places a sub-node below the node that consumes it, off the main flow', () => {
    const wf = layoutWorkflow(
      workflow(
        [node('Agent'), node('Model')],
        { Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] } },
      ),
    );
    const [agentX, agentY] = posOf(wf, 'Agent');
    const [modelX, modelY] = posOf(wf, 'Model');
    expect(modelY).toBeGreaterThan(agentY);
    expect(Math.abs(modelX - agentX)).toBeLessThan(260);
  });

  it('does not stack an unconnected node on top of an existing one', () => {
    const wf = layoutWorkflow(workflow([node('A'), node('B')], {}));
    expect(posOf(wf, 'A')).not.toEqual(posOf(wf, 'B'));
  });

  it('tolerates a self-loop (e.g. Split In Batches wiring its loop output back to itself)', () => {
    expect(() =>
      layoutWorkflow(
        workflow([node('Loop')], { Loop: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] } }),
      ),
    ).not.toThrow();
  });
});
