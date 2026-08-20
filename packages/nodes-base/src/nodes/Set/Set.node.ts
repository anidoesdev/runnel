import type { IDataObject, IExecuteFunctions, INodeType, NodeOutput } from '@n8n-clone/workflow';

interface IFieldAssignment {
  name: string;
  type: 'string' | 'number' | 'boolean';
  value: unknown;
}

function coerce(value: unknown, type: IFieldAssignment['type']): IDataObject[string] {
  if (type === 'number') return typeof value === 'number' ? value : Number(value);
  if (type === 'boolean') return typeof value === 'boolean' ? value : String(value).toLowerCase() === 'true';
  return typeof value === 'string' ? value : String(value);
}

/** Also known as "Edit Fields" — sets or replaces fields on every item's json. */
export const setNode: INodeType = {
  description: {
    displayName: 'Edit Fields (Set)',
    name: 'set',
    icon: 'fa:pen',
    group: ['transform'],
    version: 1,
    description: "Sets values on an item's JSON, either from a field list or a raw JSON body",
    defaults: { name: 'Edit Fields' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        default: 'manual',
        options: [
          { name: 'Manual Mapping', value: 'manual' },
          { name: 'JSON', value: 'json' },
        ],
      },
      {
        displayName: 'Fields to Set',
        name: 'fields',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        displayOptions: { show: { mode: ['manual'] } },
        options: [
          { displayName: 'Name', name: 'name', type: 'string', default: '' },
          {
            displayName: 'Type',
            name: 'type',
            type: 'options',
            default: 'string',
            options: [
              { name: 'String', value: 'string' },
              { name: 'Number', value: 'number' },
              { name: 'Boolean', value: 'boolean' },
            ],
          },
          { displayName: 'Value', name: 'value', type: 'string', default: '' },
        ],
      },
      {
        displayName: 'JSON',
        name: 'jsonOutput',
        type: 'json',
        default: '{}',
        displayOptions: { show: { mode: ['json'] } },
      },
      { displayName: 'Keep Only Set Fields', name: 'keepOnlySet', type: 'boolean', default: false },
    ],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();

    const output = items.map((item, i) => {
      const mode = this.getNodeParameter('mode', i, 'manual') as string;
      const keepOnlySet = this.getNodeParameter('keepOnlySet', i, false) as boolean;

      let assigned: IDataObject;
      if (mode === 'json') {
        const raw = this.getNodeParameter('jsonOutput', i, '{}');
        assigned = typeof raw === 'string' ? (JSON.parse(raw) as IDataObject) : (raw as IDataObject);
      } else {
        const fields = (this.getNodeParameter('fields.values', i, []) as IFieldAssignment[]) ?? [];
        assigned = {};
        for (const field of fields) {
          if (field.name) assigned[field.name] = coerce(field.value, field.type);
        }
      }

      const json = keepOnlySet ? assigned : { ...item.json, ...assigned };
      return { json, pairedItem: { item: i } };
    });

    return [output];
  },
};
