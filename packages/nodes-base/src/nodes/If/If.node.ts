import type { IExecuteFunctions, INodeExecutionData, INodeType, NodeOutput } from '@n8n-clone/workflow';

type Operator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'gt'
  | 'lt'
  | 'gte'
  | 'lte'
  | 'isEmpty'
  | 'isNotEmpty';

interface ICondition {
  leftValue: unknown;
  operator: Operator;
  rightValue?: unknown;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function evaluateCondition({ leftValue, operator, rightValue }: ICondition): boolean {
  switch (operator) {
    case 'equals':
      return leftValue == rightValue;
    case 'notEquals':
      return leftValue != rightValue;
    case 'contains':
      return String(leftValue).includes(String(rightValue));
    case 'notContains':
      return !String(leftValue).includes(String(rightValue));
    case 'gt':
      return Number(leftValue) > Number(rightValue);
    case 'lt':
      return Number(leftValue) < Number(rightValue);
    case 'gte':
      return Number(leftValue) >= Number(rightValue);
    case 'lte':
      return Number(leftValue) <= Number(rightValue);
    case 'isEmpty':
      return isEmptyValue(leftValue);
    case 'isNotEmpty':
      return !isEmptyValue(leftValue);
    default: {
      const exhaustive: never = operator;
      throw new Error(`Unknown IF operator "${String(exhaustive)}"`);
    }
  }
}

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
    properties: [
      {
        displayName: 'Combinator',
        name: 'combinator',
        type: 'options',
        default: 'and',
        options: [
          { name: 'AND', value: 'and' },
          { name: 'OR', value: 'or' },
        ],
      },
      {
        displayName: 'Conditions',
        name: 'conditions',
        type: 'fixedCollection',
        default: {},
        typeOptions: { multipleValues: true },
        options: [
          { displayName: 'Left Value', name: 'leftValue', type: 'string', default: '' },
          {
            displayName: 'Operator',
            name: 'operator',
            type: 'options',
            default: 'equals',
            options: [
              { name: 'Equals', value: 'equals' },
              { name: 'Not Equals', value: 'notEquals' },
              { name: 'Contains', value: 'contains' },
              { name: 'Does Not Contain', value: 'notContains' },
              { name: 'Greater Than', value: 'gt' },
              { name: 'Less Than', value: 'lt' },
              { name: 'Greater Than or Equal', value: 'gte' },
              { name: 'Less Than or Equal', value: 'lte' },
              { name: 'Is Empty', value: 'isEmpty' },
              { name: 'Is Not Empty', value: 'isNotEmpty' },
            ],
          },
          { displayName: 'Right Value', name: 'rightValue', type: 'string', default: '' },
        ],
      },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();
    const trueItems: INodeExecutionData[] = [];
    const falseItems: INodeExecutionData[] = [];

    items.forEach((item, i) => {
      const combinator = this.getNodeParameter('combinator', i, 'and') as 'and' | 'or';
      const conditions = (this.getNodeParameter('conditions.values', i, []) as ICondition[]) ?? [];
      const results = conditions.map(evaluateCondition);
      const passed = conditions.length === 0 || (combinator === 'or' ? results.some(Boolean) : results.every(Boolean));
      (passed ? trueItems : falseItems).push({ json: item.json, pairedItem: { item: i } });
    });

    return [trueItems, falseItems];
  },
};
