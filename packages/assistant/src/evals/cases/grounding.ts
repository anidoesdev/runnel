import type { IEvalCase } from '../types.js';
import type { INode } from '@n8n-clone/workflow';

const triggerNode: INode = { id: 'n1', name: 'Manual Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };

function httpNode(name: string, method: 'GET' | 'POST'): INode {
  return { id: `n-${name}`, name, type: 'httpRequest', typeVersion: 1, position: [260, 0], parameters: { url: 'https://example.com/api', method } };
}

/**
 * Exercises grounding (Part 4): does the agent actually call execute_dry_run/get_node_output
 * before writing an expression against upstream data, reach for execute_live only when asked to
 * genuinely run something for real, and give up (ask_user) rather than loop forever against a
 * node that keeps failing. seedExecutionOutputs (see types.ts) stand in for a real execution —
 * these cases test tool-calling behavior, not execution-engine fidelity (that's
 * packages/cli's ExecutionAdapter tests).
 */
export const GROUNDING_CASES: IEvalCase[] = [
  {
    id: 'grounds-before-referencing-upstream-field',
    prompt: 'after "Fetch Orders" runs, add a step that only keeps the orderId field from what it returns',
    seedWorkflow: {
      nodes: [triggerNode, httpNode('Fetch Orders', 'GET')],
      connections: { 'Manual Trigger': { main: [[{ node: 'Fetch Orders', type: 'main', index: 0 }]] } },
    },
    seedExecutionOutputs: {
      'Fetch Orders': { schema: { orderId: 'string', status: 'string' }, sample: { orderId: 'abc123', status: 'open' } },
    },
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'calls_tool', name: 'execute_dry_run' },
      { type: 'calls_tool', name: 'get_node_output' },
    ],
  },
  {
    id: 'reaches-for-execute-live-when-asked-to-actually-run-it',
    prompt: 'actually send the "Post Update" request for real right now — don\'t just simulate it, I want to see if it really works',
    seedWorkflow: {
      nodes: [triggerNode, httpNode('Post Update', 'POST')],
      connections: { 'Manual Trigger': { main: [[{ node: 'Post Update', type: 'main', index: 0 }]] } },
    },
    seedExecutionOutputs: { 'Post Update': { schema: { ok: 'boolean' }, sample: { ok: true } } },
    assertions: [{ type: 'calls_tool', name: 'execute_live' }],
  },
  {
    id: 'gives-up-and-asks-after-repeated-grounding-failures',
    prompt: 'ground this in the real response from "Flaky API" before you add the next step that reads its id field',
    seedWorkflow: {
      nodes: [triggerNode, httpNode('Flaky API', 'GET')],
      connections: { 'Manual Trigger': { main: [[{ node: 'Flaky API', type: 'main', index: 0 }]] } },
    },
    seedExecutionOutputs: { 'Flaky API': { schema: {}, sample: {}, error: 'Connection timed out' } },
    assertions: [{ type: 'calls_tool', name: 'execute_dry_run' }, { type: 'calls_tool', name: 'ask_user' }],
  },
];
