import type { IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

/** The legacy default-trigger node, superseded by Manual Trigger but kept for workflows saved before it existed. Behaves identically: passes the seeded starting item(s) straight through. */
export const start: INodeType = {
  description: {
    displayName: 'Start',
    name: 'start',
    icon: 'fa:play',
    group: ['trigger'],
    version: 1,
    description: 'Legacy start node — prefer Manual Trigger for new workflows',
    defaults: { name: 'Start' },
    inputs: [],
    outputs: ['main'],
    properties: [],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
};
