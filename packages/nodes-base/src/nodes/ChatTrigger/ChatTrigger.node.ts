import type { IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

/**
 * The trigger that feeds a typed chat message into whatever it's wired to. Dropping an AI Agent
 * node onto the canvas auto-attaches one of these to its main input (see WorkflowEditorView's
 * onDropNode) — the chat panel below the canvas runs the workflow starting here, seeding this
 * node's output with `{ chatInput: <message> }`, exactly like a Manual Trigger seeds a manual run.
 */
export const chatTrigger: INodeType = {
  description: {
    displayName: 'Chat',
    name: 'chatTrigger',
    icon: 'fa:comment',
    group: ['trigger'],
    version: 1,
    description: 'Starts the workflow when a message is sent from the chat panel',
    defaults: { name: 'Chat' },
    inputs: [],
    outputs: ['main'],
    properties: [],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
};
