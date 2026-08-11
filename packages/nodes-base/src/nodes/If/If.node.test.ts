import { describe, expect, it } from 'vitest';
import { ifNode } from './If.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';
import type { IDataObjectValue } from '@n8n-clone/workflow';

function conditionsNode(
  conditions: Array<{ leftValue: IDataObjectValue; operator: string; rightValue?: IDataObjectValue }>,
  combinator: 'and' | 'or' = 'and',
) {
  return makeNode({
    name: 'If',
    type: 'if',
    parameters: { combinator, conditions: { values: conditions } },
  });
}

describe('If node', () => {
  it('routes to output 0 when the single condition is true', async () => {
    const node = conditionsNode([{ leftValue: '={{ $json.age }}', operator: 'gt', rightValue: 18 }]);
    const ctx = makeExecuteFunctions([{ json: { age: 30 } }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toEqual([{ json: { age: 30 }, pairedItem: { item: 0 } }]);
    expect(falseItems).toEqual([]);
  });

  it('routes to output 1 when the condition is false', async () => {
    const node = conditionsNode([{ leftValue: '={{ $json.age }}', operator: 'gt', rightValue: 18 }]);
    const ctx = makeExecuteFunctions([{ json: { age: 10 } }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toEqual([]);
    expect(falseItems).toEqual([{ json: { age: 10 }, pairedItem: { item: 0 } }]);
  });

  it('routes each item independently', async () => {
    const node = conditionsNode([{ leftValue: '={{ $json.age }}', operator: 'gte', rightValue: 18 }]);
    const ctx = makeExecuteFunctions([{ json: { age: 10 } }, { json: { age: 20 } }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toEqual([{ json: { age: 20 }, pairedItem: { item: 1 } }]);
    expect(falseItems).toEqual([{ json: { age: 10 }, pairedItem: { item: 0 } }]);
  });

  it('combines multiple conditions with AND', async () => {
    const node = conditionsNode(
      [
        { leftValue: '={{ $json.a }}', operator: 'gt', rightValue: 0 },
        { leftValue: '={{ $json.b }}', operator: 'gt', rightValue: 0 },
      ],
      'and',
    );
    const ctx = makeExecuteFunctions([{ json: { a: 1, b: -1 } }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toEqual([]);
    expect(falseItems).toHaveLength(1);
  });

  it('combines multiple conditions with OR', async () => {
    const node = conditionsNode(
      [
        { leftValue: '={{ $json.a }}', operator: 'gt', rightValue: 0 },
        { leftValue: '={{ $json.b }}', operator: 'gt', rightValue: 0 },
      ],
      'or',
    );
    const ctx = makeExecuteFunctions([{ json: { a: 1, b: -1 } }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toHaveLength(1);
    expect(falseItems).toEqual([]);
  });

  it('treats no conditions as always true', async () => {
    const node = conditionsNode([]);
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const [trueItems, falseItems] = await ifNode.execute!.call(ctx);
    expect(trueItems).toHaveLength(1);
    expect(falseItems).toEqual([]);
  });

  it.each([
    ['equals', 'a', 'a', true],
    ['equals', 'a', 'b', false],
    ['notEquals', 'a', 'b', true],
    ['contains', 'hello world', 'world', true],
    ['notContains', 'hello world', 'xyz', true],
    ['gt', 5, 3, true],
    ['lt', 3, 5, true],
    ['gte', 5, 5, true],
    ['lte', 5, 5, true],
    ['isEmpty', '', undefined, true],
    ['isEmpty', 'x', undefined, false],
    ['isNotEmpty', 'x', undefined, true],
  ])('operator %s(%j, %j) => %j', async (operator, left, right, expected) => {
    const node = conditionsNode([{ leftValue: left, operator, rightValue: right }]);
    const ctx = makeExecuteFunctions([{ json: {} }], { node });
    const result = await ifNode.execute!.call(ctx);
    expect(result[0]!.length === 1).toBe(expected);
  });
});
