import type { IDataObject, IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';

interface ILoopState {
  items?: INodeExecutionData[];
  position?: number;
}

/**
 * Loop Over Items (aka Split In Batches). Output 0 ("loop") emits the next batch each time
 * it runs and is meant to be wired back into this node's own input, forming the legal cycle
 * the workflow package's cycle detector allows via `iterationNode: true`. Output 1 ("done")
 * fires exactly once, once every item has been through the loop, carrying the complete
 * original set — useful for a final aggregation step after the loop body has run.
 *
 * State (the original item batch and the current position) is tracked via node context
 * (`getContext('node')`) rather than re-reading input each call, since only the *first*
 * call actually receives the real batch — every re-entry after that comes back around the
 * loop-back edge, not from upstream.
 */
export const splitInBatches: INodeType = {
  description: {
    displayName: 'Split In Batches',
    name: 'splitInBatches',
    icon: 'fa:sync',
    group: ['transform'],
    version: 1,
    description: 'Splits input items into batches and loops over them',
    defaults: { name: 'Loop Over Items' },
    inputs: ['main'],
    outputs: ['main', 'main'],
    iterationNode: true,
    properties: [
      { displayName: 'Batch Size', name: 'batchSize', type: 'number', default: 1, typeOptions: { minValue: 1 } },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const context = this.getContext('node') as ILoopState;
    if (context.items === undefined) {
      context.items = this.getInputData();
      context.position = 0;
    }

    const items = context.items;
    const position = context.position!;
    const batchSize = Math.max(1, this.getNodeParameter('batchSize', 0, 1) as number);

    if (position < items.length) {
      context.position = position + batchSize;
      const batch = items.slice(position, position + batchSize).map((item, i) => ({
        json: item.json as IDataObject,
        binary: item.binary,
        pairedItem: { item: position + i },
      }));
      return [batch, []];
    }

    return [[], items];
  },
};
