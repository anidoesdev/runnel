import { buildExecuteFunctions } from '@n8n-clone/core';
import type { IExecuteFunctionsOptions } from '@n8n-clone/core';
import type { IExecuteFunctions, INode, INodeExecutionData, NodeOutput } from '@n8n-clone/workflow';

type NodeFixture = { name: string; type?: string } & Partial<Omit<INode, 'name' | 'type'>>;

let autoId = 0;

export function makeNode(fixture: NodeFixture): INode {
  autoId += 1;
  return {
    id: `node-${autoId}`,
    type: 'test.node',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...fixture,
  };
}

/**
 * Builds a real IExecuteFunctions (via @n8n-clone/core's buildExecuteFunctions) around a
 * single node with a single input branch of items — the shape every one of these node unit
 * tests needs, without going through the full WorkflowExecute engine.
 */
export function makeExecuteFunctions(
  items: INodeExecutionData[],
  overrides: Partial<IExecuteFunctionsOptions> & { node: INode; inputData?: NodeOutput } = { node: makeNode({ name: 'Node1' }) },
): IExecuteFunctions {
  const node = overrides.node;
  return buildExecuteFunctions({
    inputData: [items],
    runIndex: 0,
    workflow: { id: 'wf-1', name: 'Test Workflow', active: false, nodes: [node], connections: {} },
    runData: {},
    mode: 'manual',
    contextData: {},
    ...overrides,
  });
}
