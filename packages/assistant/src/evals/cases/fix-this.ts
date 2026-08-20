import type { IEvalCase } from '../types.js';
import type { INode } from '@n8n-clone/workflow';

const triggerNode: INode = { id: 'n1', name: 'Manual Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} };

function fixThisMessage(nodeName: string, error: string, inputData: unknown): string {
  return [
    `The "${nodeName}" node failed when I ran this workflow.`,
    `Error: ${error}`,
    '',
    `Here is the real input data "${nodeName}" received:`,
    '```json',
    JSON.stringify(inputData, null, 2),
    '```',
    '',
    'Please diagnose what went wrong and fix it.',
  ].join('\n');
}

/**
 * Exercises the "Fix this" flow (Milestone 8): a single message shaped exactly like
 * assistantStore.fixExecutionError's real output — real error text plus real input data for the
 * failing node — and checks the agent fixes the actual node in place rather than proposing a
 * rebuild. Mirrors the message format in packages/editor-ui's assistant.store.ts so a prompt
 * change there and a case going stale here would be caught together.
 */
export const FIX_THIS_CASES: IEvalCase[] = [
  {
    id: 'fix-bad-expression-field',
    prompt: fixThisMessage(
      'Set Status',
      'Referenced node input data does not contain key: "status"',
      [{ json: { orderId: '123', state: 'open' } }],
    ),
    seedWorkflow: {
      nodes: [triggerNode, { id: 'n2', name: 'Set Status', type: 'set', typeVersion: 1, position: [260, 0], parameters: { fields: { values: [{ name: 'result', type: 'string', value: '={{ $json.status }}' }] } } }],
      connections: { 'Manual Trigger': { main: [[{ node: 'Set Status', type: 'main', index: 0 }]] } },
    },
    assertions: [{ type: 'calls_tool', name: 'set_node_parameters' }, { type: 'no_tool_errors' }],
  },
  {
    id: 'fix-auth-failure-credential',
    prompt: fixThisMessage('Fetch Orders', '401 Unauthorized', [{ json: { orderId: '123' } }]),
    seedWorkflow: {
      nodes: [triggerNode, { id: 'n2', name: 'Fetch Orders', type: 'httpRequest', typeVersion: 1, position: [260, 0], parameters: { url: 'https://api.example.com/orders' } }],
      connections: { 'Manual Trigger': { main: [[{ node: 'Fetch Orders', type: 'main', index: 0 }]] } },
    },
    availableCredentials: [{ id: 'cred-1', name: 'My API', type: 'httpBasicAuth' }],
    assertions: [{ type: 'calls_tool', name: 'list_credentials' }, { type: 'no_tool_errors' }],
  },
  {
    id: 'fix-missing-required-parameter',
    prompt: fixThisMessage('Run Query', 'Parameter "query" is required but was empty', [{ json: { id: 1 } }]),
    seedWorkflow: {
      nodes: [triggerNode, { id: 'n2', name: 'Run Query', type: 'postgres', typeVersion: 1, position: [260, 0], parameters: { query: '' } }],
      connections: { 'Manual Trigger': { main: [[{ node: 'Run Query', type: 'main', index: 0 }]] } },
    },
    assertions: [{ type: 'calls_tool', name: 'set_node_parameters' }, { type: 'does_not_call_tool', name: 'remove_node' }, { type: 'no_tool_errors' }],
  },
];
