import type { IDataObject, IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

function getByPath(json: IDataObject, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as object)) {
      return (acc as IDataObject)[key];
    }
    return undefined;
  }, json);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

/** Sorts all input items by a field (dot-path supported); parameters are read once, against the first item, matching how a whole-list operation (as opposed to a per-item one) is configured in the editor. */
export const sortNode: INodeType = {
  description: {
    displayName: 'Sort',
    name: 'sort',
    icon: 'fa:sort',
    group: ['transform'],
    version: 1,
    description: 'Sorts items by a field',
    defaults: { name: 'Sort' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      { displayName: 'Field Name', name: 'field', type: 'string', default: '', required: true },
      {
        displayName: 'Order',
        name: 'order',
        type: 'options',
        default: 'ascending',
        options: [
          { name: 'Ascending', value: 'ascending' },
          { name: 'Descending', value: 'descending' },
        ],
      },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const field = this.getNodeParameter('field', 0, '') as string;
    const order = this.getNodeParameter('order', 0, 'ascending') as string;

    const sorted = items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => {
        const result = compare(getByPath(a.item.json, field), getByPath(b.item.json, field));
        return order === 'descending' ? -result : result;
      })
      .map(({ item, index }) => ({ json: item.json, pairedItem: { item: index } }));

    return [sorted];
  },
};
