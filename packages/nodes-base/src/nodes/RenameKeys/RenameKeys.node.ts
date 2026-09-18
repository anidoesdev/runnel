import type { IDataObject, IExecuteFunctions, INodeType, NodeOutput } from '@runnel/workflow';

interface IRename {
  from: string;
  to: string;
}

/** Renames top-level JSON keys; a key not covered by any rename passes through under its original name. */
export const renameKeysNode: INodeType = {
  description: {
    displayName: 'Rename Keys',
    name: 'renameKeys',
    icon: 'fa:i-cursor',
    group: ['transform'],
    version: 1,
    description: "Renames one or more of an item's top-level JSON keys",
    defaults: { name: 'Rename Keys' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Keys to Rename',
        name: 'renames',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        options: [
          { displayName: 'From', name: 'from', type: 'string', default: '', required: true },
          { displayName: 'To', name: 'to', type: 'string', default: '', required: true },
        ],
      },
    ],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();

    const output = items.map((item, i) => {
      const renames = (this.getNodeParameter('renames.values', i, []) as IRename[]) ?? [];
      const json: IDataObject = {};

      for (const [key, value] of Object.entries(item.json)) {
        const renamed = renames.find((r) => r.from === key);
        json[renamed?.to || key] = value;
      }

      return { json, pairedItem: { item: i } };
    });

    return [output];
  },
};
