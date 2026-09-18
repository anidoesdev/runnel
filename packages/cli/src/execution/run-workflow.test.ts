import { describe, expect, it } from 'vitest';
import { findStartNodeName } from './run-workflow.js';
import type { IWorkflowBase } from '@runnel/workflow';

function makeWorkflow(nodes: string[], connections: IWorkflowBase['connections']): IWorkflowBase {
  return {
    id: 'wf-1',
    name: 'test',
    active: false,
    nodes: nodes.map((name, i) => ({ id: `n${i}`, name, type: 'test.node', typeVersion: 1, position: [0, 0], parameters: {} })),
    connections,
  };
}

describe('findStartNodeName', () => {
  it('picks the node with no incoming main connection', () => {
    const workflow = makeWorkflow(['Trigger', 'Set'], { Trigger: { main: [[{ node: 'Set', type: 'main', index: 0 }]] } });
    expect(findStartNodeName(workflow)).toBe('Trigger');
  });

  it("does not pick a node that only supplies an ai_* connection — it's a sub-node, not a trigger", () => {
    const workflow = makeWorkflow(['Chat Model', 'Trigger', 'Agent'], {
      Trigger: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] },
      'Chat Model': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
    });
    // "Chat Model" comes first in `nodes` and has no incoming *main* connection either — without
    // the sub-node exclusion it would be picked over the real trigger.
    expect(findStartNodeName(workflow)).toBe('Trigger');
  });

  it('falls back to the first node when every node has a parent or is a sub-node source', () => {
    const workflow = makeWorkflow(['A', 'B'], { A: { main: [[{ node: 'B', type: 'main', index: 0 }]] } });
    expect(findStartNodeName(workflow)).toBe('A');
  });
});
