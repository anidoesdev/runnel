import type { INodeProperties } from '@n8n-clone/workflow';

/** Shared by If, Switch, and Filter — the same "compare two values" building block each of them routes/keeps items with. */
export type ConditionOperator =
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

export interface ICondition {
  leftValue: unknown;
  operator: ConditionOperator;
  rightValue?: unknown;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

export function evaluateCondition({ leftValue, operator, rightValue }: ICondition): boolean {
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
      throw new Error(`Unknown operator "${String(exhaustive)}"`);
    }
  }
}

export function evaluateConditions(conditions: ICondition[], combinator: 'and' | 'or'): boolean {
  if (conditions.length === 0) return true;
  const results = conditions.map(evaluateCondition);
  return combinator === 'or' ? results.some(Boolean) : results.every(Boolean);
}

export const combinatorProperty: INodeProperties = {
  displayName: 'Combinator',
  name: 'combinator',
  type: 'options',
  default: 'and',
  options: [
    { name: 'AND', value: 'and' },
    { name: 'OR', value: 'or' },
  ],
};

export const operatorOptions: INodeProperties = {
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
};

export const conditionsProperty: INodeProperties = {
  displayName: 'Conditions',
  name: 'conditions',
  type: 'fixedCollection',
  default: {},
  typeOptions: { multipleValues: true },
  options: [
    { displayName: 'Left Value', name: 'leftValue', type: 'string', default: '' },
    operatorOptions,
    { displayName: 'Right Value', name: 'rightValue', type: 'string', default: '' },
  ],
};
