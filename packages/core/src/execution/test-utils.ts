import type { IConnections, INode, IWorkflowBase } from '@runnel/workflow';

type NodeFixture = { name: string; type?: string } & Partial<Omit<INode, 'name' | 'type'>>;

let autoId = 0;

export function makeNode(fixture: NodeFixture): INode {
  autoId += 1;
  return {
    id: `node-${autoId}`,
    type: 'test.noOp',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...fixture,
  };
}

export function makeWorkflow(nodes: INode[], connections: IConnections): IWorkflowBase {
  return { id: 'test-workflow', name: 'Test Workflow', active: false, nodes, connections };
}
