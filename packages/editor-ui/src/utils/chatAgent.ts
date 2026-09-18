import type { IConnections, INode } from '@runnel/workflow';

/** True once some node feeds `nodeName`'s `main` input — used to avoid wiring a second trigger into an AI Agent that already has one. */
export function hasMainInput(nodeName: string, connections: IConnections): boolean {
  return Object.values(connections).some((entry) => (entry.main ?? []).some((branch) => branch.some((c) => c.node === nodeName)));
}

/** The Chat node feeding `agentNode`'s main input, if any — the bottom chat panel runs the workflow starting here. */
export function findChatTriggerNode(agentNode: INode, nodes: INode[], connections: IConnections): INode | undefined {
  const sourceNames = new Set(
    Object.entries(connections)
      .filter(([, entry]) => (entry.main ?? []).some((branch) => branch.some((c) => c.node === agentNode.name)))
      .map(([source]) => source),
  );
  return nodes.find((node) => node.type === 'chatTrigger' && sourceNames.has(node.name));
}

/** Every AI Agent node with a Chat trigger wired into its main input — each is a candidate target for the bottom chat dock. */
export function findChatReadyAgents(nodes: INode[], connections: IConnections): INode[] {
  return nodes.filter((node) => node.type === 'aiAgent' && findChatTriggerNode(node, nodes, connections) !== undefined);
}
