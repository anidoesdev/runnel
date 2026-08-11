import { afterEach, describe, expect, it } from 'vitest';
import { MapNodeTypes, WorkflowExecute } from '@n8n-clone/core';
import { Workflow } from '@n8n-clone/workflow';
import { registerAllNodeTypes } from './index.js';
import { startTestServer } from './test-server.js';
import type { TestServer } from './test-server.js';
import type { IWorkflowBase } from '@n8n-clone/workflow';

/**
 * M5 definition-of-done test: a nine-node workflow — one instance of every M5 node type —
 * with a real branch (If) and a real loop (Split In Batches <-> Code), executing correctly
 * offline against a real local HTTP server standing in for an external API.
 *
 * Manual Trigger and Start are functionally identical entry points (Start predates Manual
 * Trigger); a real workflow would only ever use one. Both are included back to back here
 * purely so all nine M5 node types appear in the graph, per the milestone's own wording.
 *
 * Graph:
 *   ManualTrigger -> Start -> Set -> If ---true---> HttpRequest --\
 *                                       \--false--> NoOp ---------+--> Merge -> SplitInBatches
 *                                                                              /       ^
 *                                                                     (loop) Code <----/
 *   SplitInBatches's "done" output has no downstream connection; its own runData holds the
 *   final aggregated batch, which is enough to assert the loop completed correctly.
 */
function buildWorkflow(apiUrl: string): IWorkflowBase {
  return {
    id: 'nine-node-workflow',
    name: 'Nine Node Workflow',
    active: false,
    nodes: [
      { id: '1', name: 'Manual Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      { id: '2', name: 'Start', type: 'start', typeVersion: 1, position: [1, 0], parameters: {} },
      {
        id: '3',
        name: 'Set',
        type: 'set',
        typeVersion: 1,
        position: [2, 0],
        parameters: { fields: { values: [{ name: 'setMarker', type: 'boolean', value: 'true' }] } },
      },
      {
        id: '4',
        name: 'If',
        type: 'if',
        typeVersion: 1,
        position: [3, 0],
        parameters: {
          combinator: 'and',
          conditions: { values: [{ leftValue: '={{ $json.route }}', operator: 'equals', rightValue: 'api' }] },
        },
      },
      {
        id: '5',
        name: 'HTTP Request',
        type: 'httpRequest',
        typeVersion: 1,
        position: [4, -1],
        parameters: { url: apiUrl, method: 'GET' },
      },
      { id: '6', name: 'No Op', type: 'noOp', typeVersion: 1, position: [4, 1], parameters: {} },
      { id: '7', name: 'Merge', type: 'merge', typeVersion: 1, position: [5, 0], parameters: { mode: 'append' } },
      {
        id: '8',
        name: 'Split In Batches',
        type: 'splitInBatches',
        typeVersion: 1,
        position: [6, 0],
        parameters: { batchSize: 1 },
      },
      {
        id: '9',
        name: 'Code',
        type: 'code',
        typeVersion: 1,
        position: [7, 0],
        parameters: {
          mode: 'runOnceForEachItem',
          jsCode: 'return { ...$json, codeRan: true };',
        },
      },
    ],
    connections: {
      'Manual Trigger': { main: [[{ node: 'Start', type: 'main', index: 0 }]] },
      Start: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
      Set: { main: [[{ node: 'If', type: 'main', index: 0 }]] },
      If: {
        main: [
          [{ node: 'HTTP Request', type: 'main', index: 0 }],
          [{ node: 'No Op', type: 'main', index: 0 }],
        ],
      },
      'HTTP Request': { main: [[{ node: 'Merge', type: 'main', index: 0 }]] },
      'No Op': { main: [[{ node: 'Merge', type: 'main', index: 1 }]] },
      Merge: { main: [[{ node: 'Split In Batches', type: 'main', index: 0 }]] },
      'Split In Batches': {
        main: [
          [{ node: 'Code', type: 'main', index: 0 }],
          [],
        ],
      },
      Code: { main: [[{ node: 'Split In Batches', type: 'main', index: 0 }]] },
    },
  };
}

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('nine-node workflow (M5 definition of done)', () => {
  it('is a legal graph per the workflow package\'s own cycle-legality rule', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{}');
    });
    const workflowDef = buildWorkflow(server.url);
    const workflow = new Workflow(workflowDef);

    const isIterationNode = (type: string): boolean => type === 'splitInBatches';
    expect(workflow.detectIllegalCycles(isIterationNode)).toEqual([]);
  });

  it('executes end to end: branch routes correctly, HTTP Request hits the mock server, the loop visits every item exactly once', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ result: 'ok', value: 21 }));
    });
    const workflowDef = buildWorkflow(server.url);

    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const workflowExecute = new WorkflowExecute(nodeTypes, { mode: 'manual', sleep: async () => {} });

    const seedItems = [{ json: { route: 'api', n: 1 } }, { json: { route: 'other', n: 2 } }];
    const result = await workflowExecute.run(workflowDef, 'Manual Trigger', [seedItems]);

    // No node failed and the run drained to completion.
    expect(result.resultData.error).toBeUndefined();
    expect(result.executionData!.nodeExecutionStack).toHaveLength(0);

    const lastRun = (name: string) => {
      const runs = result.resultData.runData[name];
      return runs?.[runs.length - 1];
    };

    // Set added its marker to both items.
    expect(lastRun('Set')!.data!.main[0]).toEqual([
      { json: { route: 'api', n: 1, setMarker: true }, pairedItem: { item: 0 } },
      { json: { route: 'other', n: 2, setMarker: true }, pairedItem: { item: 1 } },
    ]);

    // The branch routed item 0 (route: "api") true and item 1 (route: "other") false.
    expect(lastRun('If')!.data!.main[0]).toEqual([
      { json: { route: 'api', n: 1, setMarker: true }, pairedItem: { item: 0 } },
    ]);
    expect(lastRun('If')!.data!.main[1]).toEqual([
      { json: { route: 'other', n: 2, setMarker: true }, pairedItem: { item: 1 } },
    ]);

    // HTTP Request actually called the local mock server and got its response back.
    expect(lastRun('HTTP Request')!.data!.main[0]).toEqual([
      { json: { result: 'ok', value: 21 }, pairedItem: { item: 0 } },
    ]);

    // No Op passed the false-branch item straight through.
    expect(lastRun('No Op')!.data!.main[0]).toEqual([
      { json: { route: 'other', n: 2, setMarker: true }, pairedItem: { item: 1 } },
    ]);

    // Merge combined both branches' single item each into one two-item list.
    const mergedItems = lastRun('Merge')!.data!.main[0]!;
    expect(mergedItems).toHaveLength(2);
    expect(mergedItems[0]!.json).toEqual({ result: 'ok', value: 21 });
    expect(mergedItems[1]!.json).toEqual({ route: 'other', n: 2, setMarker: true });

    // Split In Batches (batchSize 1, 2 items) runs 3 times: one per item, plus one to finish.
    const loopRuns = result.resultData.runData['Split In Batches']!;
    expect(loopRuns).toHaveLength(3);
    expect(loopRuns[0]!.data!.main[0]).toHaveLength(1);
    expect(loopRuns[1]!.data!.main[0]).toHaveLength(1);
    expect(loopRuns[2]!.data!.main[0]).toEqual([]);
    expect(loopRuns[2]!.data!.main[1]).toEqual(mergedItems); // the "done" batch is the full merged set

    // Code — the loop body — ran once per item, tagging each with codeRan: true.
    const codeRuns = result.resultData.runData.Code!;
    expect(codeRuns).toHaveLength(2);
    expect(codeRuns[0]!.data!.main[0]).toEqual([{ json: { result: 'ok', value: 21, codeRan: true }, pairedItem: { item: 0 } }]);
    expect(codeRuns[1]!.data!.main[0]).toEqual([
      { json: { route: 'other', n: 2, setMarker: true, codeRan: true }, pairedItem: { item: 0 } },
    ]);
  });

  it('fails the run and stops cleanly when the mock server errors', async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end('{}');
    });
    const workflowDef = buildWorkflow(server.url);
    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const workflowExecute = new WorkflowExecute(nodeTypes, { mode: 'manual', sleep: async () => {} });

    const result = await workflowExecute.run(workflowDef, 'Manual Trigger', [[{ json: { route: 'api', n: 1 } }]]);

    expect(result.resultData.error).toBeDefined();
    expect(result.resultData.runData['HTTP Request']![0]!.executionStatus).toBe('error');
    // Downstream of the failed node never ran.
    expect(result.resultData.runData.Merge).toBeUndefined();
  });
});
