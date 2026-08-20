import type { IDataObject, IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

/** Drops items whose comparison key (a specific field, or the whole JSON) has already been seen earlier in the input — the first occurrence of each key is kept. */
export const removeDuplicatesNode: INodeType = {
  description: {
    displayName: 'Remove Duplicates',
    name: 'removeDuplicates',
    icon: 'fa:clone',
    group: ['transform'],
    version: 1,
    description: 'Removes items that duplicate an earlier item',
    defaults: { name: 'Remove Duplicates' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Compare',
        name: 'compare',
        type: 'options',
        default: 'allFields',
        options: [
          { name: 'All Fields', value: 'allFields' },
          { name: 'Selected Field', value: 'field' },
        ],
      },
      {
        displayName: 'Field Name',
        name: 'field',
        type: 'string',
        default: '',
        displayOptions: { show: { compare: ['field'] } },
      },
    ],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const compare = this.getNodeParameter('compare', 0, 'allFields') as string;
    const field = this.getNodeParameter('field', 0, '') as string;

    const seen = new Set<string>();
    const kept: NodeOutput[0] = [];

    items.forEach((item, index) => {
      const key = compare === 'field' ? JSON.stringify((item.json as IDataObject)[field] ?? null) : JSON.stringify(item.json);
      if (seen.has(key)) return;
      seen.add(key);
      kept.push({ json: item.json, pairedItem: { item: index } });
    });

    return [kept];
  },
};
