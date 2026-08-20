import type { IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

/**
 * The default trigger for manually running a workflow from the editor. `trigger()`/the
 * activation lifecycle that real triggers need is M7 territory (ActiveWorkflowManager); for
 * M4/M5's execute()-only engine, a manual run simply seeds this node with the starting item(s)
 * and it passes them straight through.
 */
export const manualTrigger: INodeType = {
  description: {
    displayName: 'Manual Trigger',
    name: 'manualTrigger',
    icon: 'fa:mouse-pointer',
    group: ['trigger'],
    version: 1,
    description: 'Runs the workflow when you click "Execute Workflow" in the editor',
    defaults: { name: 'Manual Trigger' },
    inputs: [],
    outputs: ['main'],
    properties: [],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
};
