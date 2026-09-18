import { describe, expect, it } from 'vitest';
import { flowTiming, layoutFlow, REST_SECONDS, STEP_SECONDS } from './flowLayout.js';
import type { IConnections } from '@runnel/workflow';

const METRICS = { nodeWidth: 100, nodeHeight: 40, gapX: 200, gapY: 80 };

function node(name: string, type = 'noOp', y = 0) {
  return { name, type, position: [0, y] as [number, number] };
}

function main(...pairs: Array<[string, string]>): IConnections {
  const connections: IConnections = {};
  for (const [from, to] of pairs) {
    const entry = (connections[from] ??= {});
    (entry.main ??= [[]])[0]!.push({ node: to, type: 'main', index: 0 });
  }
  return connections;
}

describe('layoutFlow', () => {
  it('handles an empty workflow', () => {
    expect(layoutFlow([], {}, METRICS)).toMatchObject({ nodes: [], edges: [], steps: 0 });
  });

  it('places a chain left to right, one step per column', () => {
    const layout = layoutFlow([node('A'), node('B'), node('C')], main(['A', 'B'], ['B', 'C']), METRICS);
    expect(layout.nodes.map((n) => [n.name, n.step, n.x])).toEqual([
      ['A', 0, 0],
      ['B', 1, 200],
      ['C', 2, 400],
    ]);
    expect(layout.steps).toBe(3);
    expect(layout.edges.map((e) => e.step)).toEqual([0, 1]);
  });

  it('stacks a branch in the same column, keeping the user\'s vertical order, centred', () => {
    const layout = layoutFlow([node('If'), node('Low', 'noOp', 300), node('High', 'noOp', -300)], main(['If', 'High'], ['If', 'Low']), METRICS);
    const high = layout.nodes.find((n) => n.name === 'High')!;
    const low = layout.nodes.find((n) => n.name === 'Low')!;
    expect(high.step).toBe(1);
    expect(low.step).toBe(1);
    expect(high.y).toBe(-40);
    expect(low.y).toBe(40);
  });

  it('uses the longest path when a node is reachable two ways', () => {
    const layout = layoutFlow([node('A'), node('B'), node('C')], main(['A', 'B'], ['B', 'C'], ['A', 'C']), METRICS);
    expect(layout.nodes.find((n) => n.name === 'C')!.step).toBe(2);
  });

  it('puts chat models and tools under their agent, running in the agent\'s step', () => {
    const connections: IConnections = {
      ...main(['Chat', 'Agent']),
      Model: { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
      Calc: { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
    };
    const layout = layoutFlow([node('Chat'), node('Agent'), node('Model'), node('Calc')], connections, METRICS);
    const agent = layout.nodes.find((n) => n.name === 'Agent')!;
    const model = layout.nodes.find((n) => n.name === 'Model')!;

    expect(model).toMatchObject({ isSubNode: true, step: agent.step, y: agent.y + 80 });
    expect(layout.edges.filter((e) => e.kind === 'ai')).toHaveLength(2);
    expect(layout.edges.filter((e) => e.kind === 'ai').every((e) => e.step === agent.step)).toBe(true);
    expect(layout.steps).toBe(2);
  });

  it('survives a loop without spinning forever', () => {
    const layout = layoutFlow([node('Batch'), node('Work')], main(['Batch', 'Work'], ['Work', 'Batch']), METRICS);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.steps).toBeLessThanOrEqual(2);
  });

  it('ignores connections to nodes that are not in the workflow', () => {
    const layout = layoutFlow([node('A')], main(['A', 'Ghost']), METRICS);
    expect(layout.edges).toEqual([]);
  });

  it('sizes the view box around every node with padding', () => {
    const layout = layoutFlow([node('A'), node('B')], main(['A', 'B']), METRICS);
    expect(layout.viewBox).toEqual({ x: -24, y: -24, width: 200 + 100 + 48, height: 40 + 48 });
  });
});

describe('flowTiming', () => {
  it('gives each step an equal slice of the run, then rests before looping', () => {
    const timing = flowTiming(3);
    expect(timing.cycle).toBeCloseTo(3 * STEP_SECONDS + REST_SECONDS);
    expect(timing.stepWindow(0).start).toBe(0);
    expect(timing.stepWindow(1).start).toBeCloseTo(timing.stepWindow(0).end);
    expect(timing.stepWindow(2).end).toBeLessThan(1);
  });
});
