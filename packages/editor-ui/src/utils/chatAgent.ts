import type { IConnections, INode } from '@n8n-clone/workflow';

/** An AI Agent node counts as chat-ready once some node feeds its `ai_languageModel` input — mirrors the check the node itself makes at execute-time in AiAgent.node.ts. */
export function findChatAgentNode(nodes: INode[], connections: IConnections): INode | undefined {
  return nodes.find(
    (node) =>
      node.type === 'aiAgent' &&
      Object.values(connections).some((entry) =>
        (entry.ai_languageModel ?? []).some((branch) => branch.some((c) => c.node === node.name)),
      ),
  );
}
