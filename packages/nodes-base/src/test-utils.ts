import { buildExecuteFunctions, buildPollFunctions, buildTriggerFunctions, buildWebhookFunctions } from '@runnel/core';
import type { IExecuteFunctionsOptions, IPollOrTriggerFunctionsOptions, ITriggerFunctionsOptions, IWebhookFunctionsOptions } from '@runnel/core';
import type {
  IExecuteFunctions,
  INode,
  INodeExecutionData,
  IPollFunctions,
  ITriggerFunctions,
  IWebhookFunctions,
  IWorkflowBase,
  NodeOutput,
} from '@runnel/workflow';

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
 * Builds a real IExecuteFunctions (via @runnel/core's buildExecuteFunctions) around a
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

function makeWorkflowFor(node: INode): IWorkflowBase {
  return { id: 'wf-1', name: 'Test Workflow', active: false, nodes: [node], connections: {} };
}

/** Builds a real IPollFunctions (via @runnel/core's buildPollFunctions) around a single node. */
export function makePollFunctions(
  overrides: Partial<IPollOrTriggerFunctionsOptions> & { node: INode } = { node: makeNode({ name: 'Node1' }) },
): IPollFunctions {
  return buildPollFunctions({ workflow: makeWorkflowFor(overrides.node), mode: 'trigger', ...overrides });
}

/** Builds a real ITriggerFunctions (via @runnel/core's buildTriggerFunctions) around a single node. */
export function makeTriggerFunctions(
  overrides: Partial<ITriggerFunctionsOptions> & { node: INode; emit: ITriggerFunctionsOptions['emit'] },
): ITriggerFunctions {
  return buildTriggerFunctions({ workflow: makeWorkflowFor(overrides.node), mode: 'trigger', ...overrides });
}

/** Builds a real IWebhookFunctions (via @runnel/core's buildWebhookFunctions) around a single node. */
export function makeWebhookFunctions(
  overrides: Partial<IWebhookFunctionsOptions> & {
    node: INode;
    request: IWebhookFunctionsOptions['request'];
    response: IWebhookFunctionsOptions['response'];
  },
): IWebhookFunctions {
  return buildWebhookFunctions({ workflow: makeWorkflowFor(overrides.node), mode: 'webhook', ...overrides });
}
