import type { IExecuteFunctions, INodeType, NodeOutput } from '@runnel/workflow';

/** Passes its input straight through — useful as a merge/label point in a workflow with no data transformation. */
export const noOp: INodeType = {
  description: {
    displayName: 'No Operation, do nothing',
    name: 'noOp',
    icon: 'fa:arrow-right',
    group: ['transform'],
    version: 1,
    description: 'Does nothing and passes its input through unchanged',
    defaults: { name: 'No Operation' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    return [this.getInputData()];
  },
};
