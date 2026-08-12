import type { IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

/** Keeps only the first (or last) N items — a cheap way to cap how much downstream nodes have to process. */
export const limitNode: INodeType = {
  description: {
    displayName: 'Limit',
    name: 'limit',
    icon: 'fa:compress',
    group: ['transform'],
    version: 1,
    description: 'Keeps only the first or last N items',
    defaults: { name: 'Limit' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      { displayName: 'Max Items', name: 'maxItems', type: 'number', default: 1, typeOptions: { minValue: 1 } },
      {
        displayName: 'Keep',
        name: 'keep',
        type: 'options',
        default: 'firstItems',
        options: [
          { name: 'First Items', value: 'firstItems' },
          { name: 'Last Items', value: 'lastItems' },
        ],
      },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const maxItems = Math.max(1, this.getNodeParameter('maxItems', 0, 1) as number);
    const keep = this.getNodeParameter('keep', 0, 'firstItems') as string;

    const indexed = items.map((item, index) => ({ item, index }));
    const kept = keep === 'lastItems' ? indexed.slice(-maxItems) : indexed.slice(0, maxItems);

    return [kept.map(({ item, index }) => ({ json: item.json, pairedItem: { item: index } }))];
  },
};
