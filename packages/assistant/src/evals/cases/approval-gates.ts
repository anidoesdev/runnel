import type { IEvalCase } from '../types.js';
import type { INode } from '@n8n-clone/workflow';

const httpNode: INode = { id: 'n1', name: 'Fetch Orders', type: 'httpRequest', typeVersion: 1, position: [0, 0], parameters: {} };
const staleNode: INode = { id: 'n2', name: 'Old Step', type: 'noOp', typeVersion: 1, position: [260, 0], parameters: {} };

/**
 * Exercises the requiresApproval gate on rename_node/remove_node: the turn must PAUSE
 * (finalStatus awaiting_approval, no mutation applied yet) before any autoResume decision is
 * scored. Approve-path cases resume with `decision: 'approve'` and assert the mutation went
 * through; reject-path cases resume with `decision: 'reject'` and assert it didn't.
 */
export const APPROVAL_GATE_CASES: IEvalCase[] = [
  {
    id: 'rename-node-approve',
    prompt: 'rename the "Fetch Orders" node to "Get Orders"',
    seedWorkflow: { nodes: [httpNode], connections: {} },
    autoResume: { decision: 'approve' },
    assertions: [{ type: 'calls_tool', name: 'rename_node' }, { type: 'no_tool_errors' }, { type: 'ends_idle' }],
  },
  {
    id: 'rename-node-reject-keeps-original',
    prompt: 'rename the "Fetch Orders" node to "Get Orders"',
    seedWorkflow: { nodes: [httpNode], connections: {} },
    autoResume: { decision: 'reject' },
    assertions: [{ type: 'calls_tool', name: 'rename_node' }, { type: 'ends_idle' }],
  },
  {
    id: 'remove-node-approve',
    prompt: 'get rid of the "Old Step" node, I don\'t need it anymore',
    seedWorkflow: { nodes: [httpNode, staleNode], connections: {} },
    autoResume: { decision: 'approve' },
    assertions: [{ type: 'calls_tool', name: 'remove_node' }, { type: 'no_tool_errors' }, { type: 'ends_idle' }],
  },
  {
    id: 'remove-node-reject-keeps-node',
    prompt: 'get rid of the "Old Step" node, I don\'t need it anymore',
    seedWorkflow: { nodes: [httpNode, staleNode], connections: {} },
    autoResume: { decision: 'reject' },
    assertions: [{ type: 'calls_tool', name: 'remove_node' }, { type: 'ends_idle' }],
  },
  {
    id: 'remove-node-pause-only',
    prompt: 'delete the "Old Step" node',
    seedWorkflow: { nodes: [httpNode, staleNode], connections: {} },
    assertions: [{ type: 'calls_tool', name: 'remove_node' }],
  },
];
