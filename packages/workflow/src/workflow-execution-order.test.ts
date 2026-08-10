import { describe, expect, it } from 'vitest';
import { Workflow } from './workflow.js';
import { chain, makeNode, makeWorkflow } from './test-utils.js';

describe('Workflow.getExecutionOrder', () => {
  it('orders a linear chain start to finish', () => {
    const nodes = ['A', 'B', 'C'].map((name) => makeNode({ name }));
    const workflow = new Workflow(makeWorkflow(nodes, chain(['A', 'B', 'C'])));

    expect(workflow.getExecutionOrder('A')).toEqual(['A', 'B', 'C']);
  });

  it('places both branches of an IF before the node they merge into', () => {
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

    const order = workflow.getExecutionOrder('If');
    expect(order[0]).toBe('If');
    expect(order.indexOf('Merge')).toBeGreaterThan(order.indexOf('True'));
    expect(order.indexOf('Merge')).toBeGreaterThan(order.indexOf('False'));
  });

  it('places a Merge node after both of its independent upstream branches', () => {
    // Start -> A -> Merge, Start -> B -> Merge (diamond)
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

    const order = workflow.getExecutionOrder('Start');
    expect(order.indexOf('Merge')).toBe(order.length - 1);
    expect(order.indexOf('A')).toBeLessThan(order.indexOf('Merge'));
    expect(order.indexOf('B')).toBeLessThan(order.indexOf('Merge'));
  });

  it('orders a legal loop (Loop -> Body -> Loop) as one block, exit node last', () => {
    // Start -> Loop -> [Body (continue), Done (exit)], Body -> Loop
    const nodes = ['Start', 'Loop', 'Body', 'Done'].map((name) => makeNode({ name }));
    const workflow = new Workflow(
      makeWorkflow(nodes, {
        Start: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] },
        Loop: {
          main: [
            [{ node: 'Body', type: 'main', index: 0 }],
            [{ node: 'Done', type: 'main', index: 0 }],
          ],
        },
        Body: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] },
      }),
    );

    expect(workflow.getExecutionOrder('Start')).toEqual(['Start', 'Loop', 'Body', 'Done']);
  });

  it('throws when the start node does not exist', () => {
    const workflow = new Workflow(makeWorkflow([makeNode({ name: 'A' })], {}));
    expect(() => workflow.getExecutionOrder('Missing')).toThrow(/not found/);
  });
});
