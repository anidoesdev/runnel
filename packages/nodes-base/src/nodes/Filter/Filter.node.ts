import { combinatorProperty, conditionsProperty, evaluateConditions } from '../shared/conditions.js';
import type { IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';
import type { ICondition } from '../shared/conditions.js';

/** Keeps only the items matching the given conditions; everything else is dropped (single output — unlike If, there's no "false" branch to route to). */
export const filterNode: INodeType = {
  description: {
    displayName: 'Filter',
    name: 'filter',
    icon: 'fa:filter',
    group: ['transform'],
    version: 1,
    description: 'Keeps only the items matching the given conditions',
    defaults: { name: 'Filter' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [combinatorProperty, conditionsProperty],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const kept: INodeExecutionData[] = [];

    items.forEach((item, i) => {
      const combinator = this.getNodeParameter('combinator', i, 'and') as 'and' | 'or';
      const conditions = (this.getNodeParameter('conditions.values', i, []) as ICondition[]) ?? [];
      if (evaluateConditions(conditions, combinator)) {
        kept.push({ json: item.json, pairedItem: { item: i } });
      }
    });

    return [kept];
  },
};
