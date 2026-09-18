import { describe, expect, it } from 'vitest';
import { toolCalculator } from './ToolCalculator.node.js';
import { makeNode } from '../../test-utils.js';
import type { ISupplyDataFunctions } from '@runnel/workflow';
import type { IAiTool } from '../shared/ai-types.js';

function makeSupplyContext(): ISupplyDataFunctions {
  const node = makeNode({ name: 'Calculator', type: 'toolCalculator' });
  return {
    getNodeParameter: () => undefined,
    getCredentials: async () => ({}),
    getNode: () => node,
    getWorkflow: () => ({ id: 'wf-1', name: 'test', active: false }),
    helpers: {
      httpRequest: async () => ({}),
      httpRequestWithAuthentication: async () => ({}),
      returnJsonArray: (items) => items.map((json) => ({ json })),
      constructExecutionMetaData: (items) => items,
    },
  };
}

async function getTool(): Promise<IAiTool> {
  return (await toolCalculator.supplyData!.call(makeSupplyContext())) as IAiTool;
}

describe('Calculator Tool node', () => {
  it('describes itself with a name, description, and JSON-schema-shaped parameters', async () => {
    const tool = await getTool();
    expect(tool.name).toBe('calculator');
    expect(tool.description).toContain('arithmetic');
    expect(tool.schema).toEqual({
      type: 'object',
      properties: { expression: { type: 'string', description: 'The arithmetic expression to evaluate' } },
      required: ['expression'],
    });
  });

  it('evaluates addition, subtraction, multiplication, and division with normal precedence', async () => {
    const tool = await getTool();
    expect(await tool.invoke({ expression: '2 + 3 * 4' })).toBe('14');
    expect(await tool.invoke({ expression: '(2 + 3) * 4' })).toBe('20');
    expect(await tool.invoke({ expression: '10 / 2 - 1' })).toBe('4');
  });

  it('handles unary minus and nested parentheses', async () => {
    const tool = await getTool();
    expect(await tool.invoke({ expression: '-(3 + 2) * -2' })).toBe('10');
  });

  it('handles decimals', async () => {
    const tool = await getTool();
    expect(await tool.invoke({ expression: '1.5 + 2.25' })).toBe('3.75');
  });

  it('returns an error string (not a thrown exception) for malformed input', async () => {
    const tool = await getTool();
    expect(await tool.invoke({ expression: '2 + ' })).toMatch(/^Error:/);
    expect(await tool.invoke({ expression: '2 + + 3' })).toMatch(/^Error:/);
    expect(await tool.invoke({ expression: '(1 + 2' })).toMatch(/^Error:/);
    expect(await tool.invoke({ expression: '2 3' })).toMatch(/^Error:/);
  });

  it('treats a missing expression argument as an error rather than throwing', async () => {
    const tool = await getTool();
    expect(await tool.invoke({})).toMatch(/^Error:/);
  });
});
