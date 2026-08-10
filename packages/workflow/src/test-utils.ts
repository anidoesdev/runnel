import type { IConnections, IWorkflowBase } from './interfaces/workflow.interfaces.js';
import type { INode } from './interfaces/node.interfaces.js';

type NodeFixture = { name: string; type?: string } & Partial<Omit<INode, 'name' | 'type'>>;

let autoId = 0;

export function makeNode(fixture: NodeFixture): INode {
  autoId += 1;
  return {
    id: `node-${autoId}`,
    type: 'n8n-clone.noOp',
    typeVersion: 1,
    position: [0, 0],
    parameters: {},
    ...fixture,
  };
}

/** `chain(['A', 'B', 'C'])` connects A -> B -> C, each on main output/input 0. */
export function chain(names: string[]): IConnections {
  const connections: IConnections = {};
  for (let i = 0; i < names.length - 1; i++) {
    connections[names[i]!] = { main: [[{ node: names[i + 1]!, type: 'main', index: 0 }]] };
  }
  return connections;
}

export function makeWorkflow(nodes: INode[], connections: IConnections): IWorkflowBase {
  return {
    id: 'test-workflow',
    name: 'Test Workflow',
    active: false,
    nodes,
    connections,
  };
}
