import { combinatorProperty, conditionsProperty, evaluateConditions } from '../shared/conditions.js';
import type { IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';
import type { ICondition } from '../shared/conditions.js';

/** Routes items to output 0 (true) or output 1 (false) based on one or more conditions, combined with AND/OR. */
export const ifNode: INodeType = {
  description: {
    displayName: 'If',
    name: 'if',
    icon: 'fa:map-signs',
    group: ['transform'],
    version: 1,
    description: 'Splits a workflow into two branches based on a condition',
    defaults: { name: 'If' },
    inputs: ['main'],
    outputs: ['main', 'main'],
    properties: [combinatorProperty, conditionsProperty],
  },
  dryRunSafety: () => 'safe',
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const trueItems: INodeExecutionData[] = [];
    const falseItems: INodeExecutionData[] = [];

    items.forEach((item, i) => {
      const combinator = this.getNodeParameter('combinator', i, 'and') as 'and' | 'or';
      const conditions = (this.getNodeParameter('conditions.values', i, []) as ICondition[]) ?? [];
      const passed = evaluateConditions(conditions, combinator);
      (passed ? trueItems : falseItems).push({ json: item.json, pairedItem: { item: i } });
    });

    return [trueItems, falseItems];
  },
};
