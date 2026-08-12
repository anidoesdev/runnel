import { evaluateCondition, operatorOptions } from '../shared/conditions.js';
import type { IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';
import type { ConditionOperator } from '../shared/conditions.js';

interface IRule {
  outputIndex: number;
  leftValue: unknown;
  operator: ConditionOperator;
  rightValue?: unknown;
}

const FALLBACK_OUTPUT = 3;

/**
 * Routes each item to the output of the *first* rule it matches (rules are evaluated in
 * order); an item matching no rule goes to the fallback output. Outputs are a fixed 4 —
 * 3 rule slots (outputIndex 0-2) plus the fallback (3) — because INodeTypeDescription.outputs
 * is a static array per node *type*, not something a node instance can resize.
 */
export const switchNode: INodeType = {
  description: {
    displayName: 'Switch',
    name: 'switch',
    icon: 'fa:random',
    group: ['transform'],
    version: 1,
    description: 'Routes items to one of several outputs based on the first matching rule',
    defaults: { name: 'Switch' },
    inputs: ['main'],
    outputs: ['main', 'main', 'main', 'main'],
    properties: [
      {
        displayName: 'Rules',
        name: 'rules',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        description: 'Evaluated top to bottom; the first matching rule sends the item to its output. Unmatched items go to output 3.',
        options: [
          { displayName: 'Output Index (0-2)', name: 'outputIndex', type: 'number', default: 0, typeOptions: { minValue: 0, maxValue: 2 } },
          { displayName: 'Left Value', name: 'leftValue', type: 'string', default: '' },
          operatorOptions,
          { displayName: 'Right Value', name: 'rightValue', type: 'string', default: '' },
        ],
      },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const outputs: INodeExecutionData[][] = [[], [], [], []];

    items.forEach((item, i) => {
      const rules = (this.getNodeParameter('rules.values', i, []) as IRule[]) ?? [];
      const match = rules.find((rule) => evaluateCondition(rule));
      const outputIndex = match ? Math.min(Math.max(Math.trunc(match.outputIndex), 0), 2) : FALLBACK_OUTPUT;
      outputs[outputIndex]!.push({ json: item.json, pairedItem: { item: i } });
    });

    return outputs;
  },
};
