import type { INodeExecutionData } from '../interfaces/common.interfaces.js';
import type { IExpressionEvalContext } from '../interfaces/expression.interfaces.js';

export function makeExpressionContext(
  overrides: Partial<IExpressionEvalContext> = {},
): IExpressionEvalContext {
  const item: INodeExecutionData = overrides.item ?? { json: {} };
  return {
    item,
    itemIndex: 0,
    runIndex: 0,
    node: {
      id: 'node-1',
      name: 'Node1',
      type: 'runnel.noOp',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    workflow: { id: 'workflow-1', name: 'Test Workflow', active: false, nodes: [], connections: {} },
    runData: {},
    mode: 'manual',
    inputItems: [item],
    ...overrides,
  };
}
