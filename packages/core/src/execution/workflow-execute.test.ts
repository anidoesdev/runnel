import { describe, expect, it } from 'vitest';
import { WorkflowExecute } from './workflow-execute.js';
import { MapNodeTypes } from './node-types.js';
import { makeNode, makeWorkflow } from './test-utils.js';
import {
  testFlakyNode,
  testIfNode,
  testLoopNode,
  testMergeNode,
  testNoOpNode,
  testNoOutputNode,
  testSetNode,
  testThrowingNode,
} from './test-nodes.js';
import type { IRunExecutionData, IWorkflowBase } from '@n8n-clone/workflow';

function registry(): MapNodeTypes {
  return new MapNodeTypes()
    .register(testNoOpNode)
    .register(testSetNode)
    .register(testIfNode)
    .register(testMergeNode)
    .register(testLoopNode)
    .register(testThrowingNode)
    .register(testFlakyNode)
    .register(testNoOutputNode);
}

function engine(): WorkflowExecute {
  return new WorkflowExecute(registry(), { mode: 'manual', sleep: async () => {} });
}

function lastRun(runExecutionData: IRunExecutionData, nodeName: string) {
  const runs = runExecutionData.resultData.runData[nodeName];
  return runs?.[runs.length - 1];
}

describe('WorkflowExecute — linear execution', () => {
  it('threads data start to finish and records one runData entry per node', async () => {
    const a = makeNode({ name: 'A', type: 'test.noOp' });
    const b = makeNode({ name: 'B', type: 'test.set', parameters: { assignments: { added: true } } });
    const c = makeNode({ name: 'C', type: 'test.noOp' });
    const workflow = makeWorkflow(
      [a, b, c],
      {
        A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
        B: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
      },
    );

    const result = await engine().run(workflow, 'A', [[{ json: { x: 1 } }]]);

    expect(result.resultData.runData.A).toHaveLength(1);
    expect(result.resultData.runData.B).toHaveLength(1);
    expect(result.resultData.runData.C).toHaveLength(1);
    expect(lastRun(result, 'C')!.data!.main[0]).toEqual([{ json: { x: 1, added: true }, pairedItem: { item: 0 } }]);
    expect(result.executionData!.nodeExecutionStack).toHaveLength(0);
  });
});

describe('WorkflowExecute — branching', () => {
  function branchWorkflow(): IWorkflowBase {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const branch = makeNode({ name: 'Branch', type: 'test.if', parameters: { condition: '={{ $json.go }}' } });
    const onTrue = makeNode({ name: 'OnTrue', type: 'test.noOp' });
    const onFalse = makeNode({ name: 'OnFalse', type: 'test.noOp' });
    return makeWorkflow([start, branch, onTrue, onFalse], {
      Start: { main: [[{ node: 'Branch', type: 'main', index: 0 }]] },
      Branch: {
        main: [
          [{ node: 'OnTrue', type: 'main', index: 0 }],
          [{ node: 'OnFalse', type: 'main', index: 0 }],
        ],
      },
    });
  }

  it('only propagates items down the taken branch', async () => {
    const workflow = branchWorkflow();
    const result = await engine().run(workflow, 'Start', [[{ json: { go: true } }]]);

    expect(lastRun(result, 'OnTrue')!.executionStatus).toBe('success');
    expect(lastRun(result, 'OnTrue')!.data!.main[0]).toEqual([{ json: { go: true }, pairedItem: { item: 0 } }]);
  });

  it('marks the untaken branch\'s downstream node as skipped, not failed', async () => {
    const workflow = branchWorkflow();
    const result = await engine().run(workflow, 'Start', [[{ json: { go: true } }]]);

    expect(lastRun(result, 'OnFalse')!.executionStatus).toBe('skipped');
    expect(lastRun(result, 'OnFalse')!.data!.main[0]).toEqual([]);
  });

  it('flips which side is skipped based on the condition', async () => {
    const workflow = branchWorkflow();
    const result = await engine().run(workflow, 'Start', [[{ json: { go: false } }]]);

    expect(lastRun(result, 'OnTrue')!.executionStatus).toBe('skipped');
    expect(lastRun(result, 'OnFalse')!.executionStatus).toBe('success');
  });
});

describe('WorkflowExecute — merging (multi-input wait)', () => {
  it('waits for both branches of a diamond before running the Merge node', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const left = makeNode({ name: 'Left', type: 'test.set', parameters: { assignments: { side: 'left' } } });
    const right = makeNode({ name: 'Right', type: 'test.set', parameters: { assignments: { side: 'right' } } });
    const merge = makeNode({ name: 'Merge', type: 'test.merge' });
    const workflow = makeWorkflow([start, left, right, merge], {
      Start: {
        main: [[{ node: 'Left', type: 'main', index: 0 }, { node: 'Right', type: 'main', index: 0 }]],
      },
      Left: { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
      Right: { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    // Merge must not fire until BOTH Left and Right have delivered — it should run exactly once.
    expect(result.resultData.runData.Merge).toHaveLength(1);
    expect(lastRun(result, 'Merge')!.data!.main[0]).toEqual([
      { json: { side: 'left' }, pairedItem: { item: 0 } },
      { json: { side: 'right' }, pairedItem: { item: 0 } },
    ]);
  });

  it('still fires once both slots are recorded even when one branch is empty', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const branch = makeNode({ name: 'Branch', type: 'test.if', parameters: { condition: false } });
    const merge = makeNode({ name: 'Merge', type: 'test.merge' });
    const workflow = makeWorkflow([start, branch, merge], {
      Start: { main: [[{ node: 'Branch', type: 'main', index: 0 }]] },
      Branch: {
        main: [
          [{ node: 'Merge', type: 'main', index: 0 }],
          [{ node: 'Merge', type: 'main', index: 1 }],
        ],
      },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { v: 1 } }]]);

    expect(result.resultData.runData.Merge).toHaveLength(1);
    expect(lastRun(result, 'Merge')!.data!.main[0]).toEqual([{ json: { v: 1 }, pairedItem: { item: 0 } }]);
  });
});

describe('WorkflowExecute — loops', () => {
  it('re-enters the loop node once per item plus once to finish, with correct per-run data', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const loop = makeNode({ name: 'Loop', type: 'test.loop' });
    const body = makeNode({ name: 'Body', type: 'test.noOp' });
    const done = makeNode({ name: 'Done', type: 'test.noOp' });
    const workflow = makeWorkflow([start, loop, body, done], {
      Start: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] },
      Loop: {
        main: [
          [{ node: 'Body', type: 'main', index: 0 }],
          [{ node: 'Done', type: 'main', index: 0 }],
        ],
      },
      Body: { main: [[{ node: 'Loop', type: 'main', index: 0 }]] },
    });

    const items = [{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }];
    const result = await engine().run(workflow, 'Start', [items]);

    // 3 items => Loop runs 4 times (3 to emit one item each, 1 to emit the done batch).
    const loopRuns = result.resultData.runData.Loop!;
    expect(loopRuns).toHaveLength(4);
    expect(loopRuns[0]!.data!.main[0]).toEqual([{ json: { n: 1 }, pairedItem: { item: 0 } }]);
    expect(loopRuns[1]!.data!.main[0]).toEqual([{ json: { n: 2 }, pairedItem: { item: 1 } }]);
    expect(loopRuns[2]!.data!.main[0]).toEqual([{ json: { n: 3 }, pairedItem: { item: 2 } }]);
    expect(loopRuns[3]!.data!.main[0]).toEqual([]);
    expect(loopRuns[3]!.data!.main[1]).toEqual(items.map((item, i) => ({ ...item, pairedItem: { item: i } })));

    // Body (the loop's own subgraph) ran exactly 3 times, once per emitted item.
    expect(result.resultData.runData.Body).toHaveLength(3);

    // Done gets one early empty (skipped) trigger from the loop's first "not done yet" pass,
    // then the real aggregated batch once the loop finishes — repeated empty re-triggers in
    // between are deduplicated (see the "already ran" guard in propagate()), which is also
    // what keeps the Body <-> Loop cycle from re-firing forever once the loop is done.
    expect(result.resultData.runData.Done).toHaveLength(2);
    expect(lastRun(result, 'Done')!.executionStatus).toBe('success');
    expect(lastRun(result, 'Done')!.data!.main[0]).toEqual(
      items.map((item, i) => ({ ...item, pairedItem: { item: i } })),
    );
  });
});

describe('WorkflowExecute — disabled nodes', () => {
  it('passes input straight through to output without calling execute', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    // Disabled Set node — if execute() ran, it would add `added: true`; it must not.
    const disabled = makeNode({
      name: 'Disabled',
      type: 'test.set',
      disabled: true,
      parameters: { assignments: { added: true } },
    });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, disabled, after], {
      Start: { main: [[{ node: 'Disabled', type: 'main', index: 0 }]] },
      Disabled: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { x: 1 } }]]);

    expect(lastRun(result, 'Disabled')!.data!.main[0]).toEqual([{ json: { x: 1 } }]);
    expect(lastRun(result, 'After')!.data!.main[0]).toEqual([{ json: { x: 1 } }]);
  });
});

describe('WorkflowExecute — executeOnce', () => {
  it('runs the node once against only the first item', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const once = makeNode({ name: 'Once', type: 'test.set', executeOnce: true, parameters: { assignments: {} } });
    const workflow = makeWorkflow([start, once], {
      Start: { main: [[{ node: 'Once', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { n: 1 } }, { json: { n: 2 } }, { json: { n: 3 } }]]);

    expect(lastRun(result, 'Once')!.data!.main[0]).toEqual([{ json: { n: 1 }, pairedItem: { item: 0 } }]);
  });
});

describe('WorkflowExecute — alwaysOutputData', () => {
  it('emits a single empty item when the node would otherwise produce none', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const noOutput = makeNode({ name: 'NoOutput', type: 'test.noOutput', alwaysOutputData: true });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, noOutput, after], {
      Start: { main: [[{ node: 'NoOutput', type: 'main', index: 0 }]] },
      NoOutput: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    expect(lastRun(result, 'NoOutput')!.data!.main[0]).toEqual([{ json: {} }]);
    expect(lastRun(result, 'After')!.executionStatus).toBe('success');
  });

  it('without alwaysOutputData, a node producing no items causes downstream to be skipped', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const noOutput = makeNode({ name: 'NoOutput', type: 'test.noOutput' });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, noOutput, after], {
      Start: { main: [[{ node: 'NoOutput', type: 'main', index: 0 }]] },
      NoOutput: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    expect(lastRun(result, 'After')!.executionStatus).toBe('skipped');
  });
});

describe('WorkflowExecute — error handling', () => {
  it('stopWorkflow (default): records the error and halts the run', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const boom = makeNode({ name: 'Boom', type: 'test.throwing' });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, boom, after], {
      Start: { main: [[{ node: 'Boom', type: 'main', index: 0 }]] },
      Boom: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    expect(lastRun(result, 'Boom')!.executionStatus).toBe('error');
    expect(result.resultData.error?.message).toBe('Test node always fails');
    expect(result.resultData.runData.After).toBeUndefined();
  });

  it('a node type with no execute() (a sub-node, only supplyData()) fails clearly instead of crashing if something tries to run it directly', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const subNode = makeNode({ name: 'Sub Node', type: 'test.subNodeOnly' });
    const workflow = makeWorkflow([start, subNode], { Start: { main: [[{ node: 'Sub Node', type: 'main', index: 0 }]] } });

    const nodeTypes = registry().register({
      description: {
        displayName: 'Sub Node Only',
        name: 'test.subNodeOnly',
        group: ['ai'],
        version: 1,
        description: 'test',
        defaults: { name: 'Sub Node Only' },
        inputs: [],
        outputs: ['ai_tool'],
        properties: [],
      },
      async supplyData() {
        return {};
      },
    });
    const result = await new WorkflowExecute(nodeTypes, { mode: 'manual', sleep: async () => {} }).run(workflow, 'Start', [
      [{ json: {} }],
    ]);

    expect(lastRun(result, 'Sub Node')!.executionStatus).toBe('error');
    expect(result.resultData.error?.message).toContain('has no execute()');
  });

  it('continueRegularOutput: tags the input items with the error and keeps going', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const boom = makeNode({ name: 'Boom', type: 'test.throwing', onError: 'continueRegularOutput' });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, boom, after], {
      Start: { main: [[{ node: 'Boom', type: 'main', index: 0 }]] },
      Boom: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { x: 1 } }]]);

    expect(result.resultData.error).toBeUndefined();
    expect(lastRun(result, 'After')!.executionStatus).toBe('success');
    const [item] = lastRun(result, 'After')!.data!.main[0]!;
    expect(item!.json).toEqual({ x: 1 });
    expect(item!.error?.message).toBe('Test node always fails');
  });

  it('continueErrorOutput: routes failed items to output index 1', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const boom = makeNode({ name: 'Boom', type: 'test.if', onError: 'continueErrorOutput' });
    // test.if has 2 outputs, satisfying the >=2 requirement for continueErrorOutput.
    // Force it to throw by never providing a `condition` parameter type it can't evaluate —
    // instead directly reuse test.throwing but register it with 2 outputs via test.if's shape:
    const errorOutputNode = makeNode({ name: 'ErrorOutput', type: 'test.noOp' });
    const regularOutputNode = makeNode({ name: 'RegularOutput', type: 'test.noOp' });
    const workflow = makeWorkflow([start, boom, errorOutputNode, regularOutputNode], {
      Start: { main: [[{ node: 'Boom', type: 'main', index: 0 }]] },
      Boom: {
        main: [
          [{ node: 'RegularOutput', type: 'main', index: 0 }],
          [{ node: 'ErrorOutput', type: 'main', index: 0 }],
        ],
      },
    });
    // test.if doesn't throw on its own — register a node under the same "test.if" name that
    // keeps test.if's 2-output description but throws like test.throwing.
    const nodeTypes = registry();
    nodeTypes.register({ execute: testThrowingNode.execute, description: testIfNode.description });
    const runner = new WorkflowExecute(nodeTypes, { mode: 'manual', sleep: async () => {} });

    const result = await runner.run(workflow, 'Start', [[{ json: { x: 1 } }]]);

    // The regular output branch got nothing (empty), so its downstream is marked skipped —
    // not run, and not failed — while the error branch actually received the tagged items.
    expect(lastRun(result, 'RegularOutput')!.executionStatus).toBe('skipped');
    expect(lastRun(result, 'ErrorOutput')!.executionStatus).toBe('success');
    const [item] = lastRun(result, 'ErrorOutput')!.data!.main[0]!;
    expect(item!.json).toEqual({ x: 1 });
    expect(item!.error?.message).toBe('Test node always fails');
  });

  it('continueErrorOutput falls back to the regular-output behavior when the node has fewer than 2 outputs', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const boom = makeNode({ name: 'Boom', type: 'test.throwing', onError: 'continueErrorOutput' });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([start, boom, after], {
      Start: { main: [[{ node: 'Boom', type: 'main', index: 0 }]] },
      Boom: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { x: 1 } }]]);

    expect(lastRun(result, 'After')!.executionStatus).toBe('success');
    expect(lastRun(result, 'After')!.data!.main[0]![0]!.error?.message).toBe('Test node always fails');
  });

  it('handles a failure in the start node itself, which has no source data', async () => {
    const boom = makeNode({ name: 'Boom', type: 'test.throwing', onError: 'continueRegularOutput' });
    const after = makeNode({ name: 'After', type: 'test.noOp' });
    const workflow = makeWorkflow([boom, after], {
      Boom: { main: [[{ node: 'After', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Boom', [[{ json: { x: 1 } }]]);

    expect(lastRun(result, 'Boom')!.source).toEqual([]);
    expect(lastRun(result, 'After')!.data!.main[0]![0]!.error?.message).toBe('Test node always fails');
  });

  it('retryOnFail retries up to maxTries before giving up, succeeding if a later attempt works', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const flaky = makeNode({ name: 'Flaky', type: 'test.flaky', retryOnFail: true, maxTries: 3 });
    const workflow = makeWorkflow([start, flaky], {
      Start: { main: [[{ node: 'Flaky', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: { x: 1 } }]]);

    expect(result.resultData.error).toBeUndefined();
    expect(lastRun(result, 'Flaky')!.executionStatus).toBe('success');
    expect(lastRun(result, 'Flaky')!.data!.main[0]).toEqual([{ json: { x: 1 } }]);
  });

  it('without retryOnFail, a flaky node fails on the very first attempt', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const flaky = makeNode({ name: 'Flaky', type: 'test.flaky' });
    const workflow = makeWorkflow([start, flaky], {
      Start: { main: [[{ node: 'Flaky', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    expect(result.resultData.error?.message).toBe('Flaky failure #1');
  });
});

describe('WorkflowExecute — serialize and resume', () => {
  it('rehydrates a JSON-round-tripped mid-execution snapshot in a fresh instance and finishes with identical output', async () => {
    const a = makeNode({ name: 'A', type: 'test.noOp' });
    const b = makeNode({ name: 'B', type: 'test.set', parameters: { assignments: { added: true } } });
    const c = makeNode({ name: 'C', type: 'test.noOp' });
    const workflow = makeWorkflow([a, b, c], {
      A: { main: [[{ node: 'B', type: 'main', index: 0 }]] },
      B: { main: [[{ node: 'C', type: 'main', index: 0 }]] },
    });

    const fullResult = await engine().run(workflow, 'A', [[{ json: { x: 1 } }]]);

    // Hand-build the state as it would exist right after A ran and B was queued, but before
    // B or C ran — this is exactly the shape a crash-recovery or queue-mode handoff would
    // serialize and ship elsewhere.
    const midExecutionState: IRunExecutionData = {
      resultData: {
        runData: {
          A: [
            {
              startTime: 0,
              executionTime: 0,
              executionStatus: 'success',
              source: [],
              data: { main: [[{ json: { x: 1 } }]] },
            },
          ],
        },
      },
      executionData: {
        contextData: {},
        nodeExecutionStack: [
          {
            node: b,
            data: { main: [[{ json: { x: 1 } }]] },
            source: { main: [{ previousNode: 'A', previousNodeOutput: 0, previousNodeRun: 0 }] },
          },
        ],
        waitingExecution: {},
        waitingExecutionSource: {},
      },
    };

    // Prove it survives a real JSON round trip (no class instances, no functions).
    const serialized = JSON.parse(JSON.stringify(midExecutionState)) as IRunExecutionData;

    // A brand new engine instance with its own fresh registry — nothing shared in memory
    // with the run above, simulating resumption in a different process.
    const resumed = await engine().resume(workflow, serialized);

    expect(resumed.resultData.runData.A).toHaveLength(1); // A was not re-run
    expect(lastRun(resumed, 'C')!.data!.main[0]).toEqual(lastRun(fullResult, 'C')!.data!.main[0]);
    expect(resumed.executionData!.nodeExecutionStack).toHaveLength(0);
  });

  it('resuming an already-finished run (empty stack) is a no-op', async () => {
    const finished: IRunExecutionData = {
      resultData: { runData: {} },
      executionData: { contextData: {}, nodeExecutionStack: [], waitingExecution: {}, waitingExecutionSource: {} },
    };
    const workflow = makeWorkflow([], {});
    const result = await engine().resume(workflow, finished);
    expect(result).toBe(finished);
  });
});

describe('WorkflowExecute — run() validation', () => {
  it('throws if the start node does not exist', async () => {
    const workflow = makeWorkflow([], {});
    await expect(engine().run(workflow, 'Missing')).rejects.toThrow(/not found/);
  });
});

describe('WorkflowExecute — malformed graph tolerance', () => {
  it('does nothing on an output branch that has no connections at all (as opposed to an empty-but-connected branch)', async () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const branch = makeNode({ name: 'Branch', type: 'test.if', parameters: { condition: true } });
    const onTrue = makeNode({ name: 'OnTrue', type: 'test.noOp' });
    // Only the true output has a connection at all — the false output has none.
    const workflow = makeWorkflow([start, branch, onTrue], {
      Start: { main: [[{ node: 'Branch', type: 'main', index: 0 }]] },
      Branch: { main: [[{ node: 'OnTrue', type: 'main', index: 0 }]] },
    });

    const result = await engine().run(workflow, 'Start', [[{ json: {} }]]);

    expect(lastRun(result, 'Branch')!.executionStatus).toBe('success');
    expect(lastRun(result, 'OnTrue')!.executionStatus).toBe('success');
  });

  it('ignores a connection that targets a node name not present in the workflow', () => {
    const start = makeNode({ name: 'Start', type: 'test.noOp' });
    const workflow = makeWorkflow([start], {
      Start: { main: [[{ node: 'DoesNotExist', type: 'main', index: 0 }]] },
    });

    return expect(engine().run(workflow, 'Start', [[{ json: {} }]])).resolves.toMatchObject({
      resultData: { runData: { Start: [{ executionStatus: 'success' }] } },
    });
  });
});
