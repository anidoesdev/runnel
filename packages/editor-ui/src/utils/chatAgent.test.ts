import { describe, expect, it } from 'vitest';
import { findChatAgentNode } from './chatAgent.js';
import type { IConnections, INode } from '@n8n-clone/workflow';

function agentNode(name: string): INode {
  return { id: name, name, type: 'aiAgent', typeVersion: 1, position: [0, 0], parameters: {} };
}

describe('findChatAgentNode', () => {
  it('returns undefined when there is no AI Agent node', () => {
    const nodes: INode[] = [{ id: '1', name: 'Set', type: 'set', typeVersion: 1, position: [0, 0], parameters: {} }];
    expect(findChatAgentNode(nodes, {})).toBeUndefined();
  });

  it('returns undefined when an AI Agent node has no chat model connected', () => {
    const nodes = [agentNode('Agent')];
    const connections: IConnections = { Trigger: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] } };
    expect(findChatAgentNode(nodes, connections)).toBeUndefined();
  });

  it('finds the AI Agent node once a chat model feeds its ai_languageModel input', () => {
    const nodes = [agentNode('Agent')];
    const connections: IConnections = {
      'Chat Model': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
    };
    expect(findChatAgentNode(nodes, connections)?.name).toBe('Agent');
  });

  it('ignores a chat model connected to something other than an AI Agent node', () => {
    const nodes: INode[] = [{ id: '1', name: 'Other', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }];
    const connections: IConnections = {
      'Chat Model': { ai_languageModel: [[{ node: 'Other', type: 'ai_languageModel', index: 0 }]] },
    };
    expect(findChatAgentNode(nodes, connections)).toBeUndefined();
  });
});
