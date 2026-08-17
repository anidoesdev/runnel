import { describe, expect, it } from 'vitest';
import { findChatReadyAgents, findChatTriggerNode, hasMainInput } from './chatAgent.js';
import type { IConnections, INode } from '@n8n-clone/workflow';

function node(name: string, type: string): INode {
  return { id: name, name, type, typeVersion: 1, position: [0, 0], parameters: {} };
}

describe('hasMainInput', () => {
  it('is false when nothing targets the node', () => {
    expect(hasMainInput('Agent', {})).toBe(false);
  });

  it('is true once some node has a main connection into it', () => {
    const connections: IConnections = { Chat: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] } };
    expect(hasMainInput('Agent', connections)).toBe(true);
  });
});

describe('findChatTriggerNode', () => {
  it('returns undefined when no Chat node feeds the agent', () => {
    const agent = node('Agent', 'aiAgent');
    const nodes = [agent, node('Trigger', 'manualTrigger')];
    const connections: IConnections = { Trigger: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] } };
    expect(findChatTriggerNode(agent, nodes, connections)).toBeUndefined();
  });

  it('finds the Chat node wired into the agent\'s main input', () => {
    const agent = node('Agent', 'aiAgent');
    const chat = node('Chat', 'chatTrigger');
    const nodes = [agent, chat];
    const connections: IConnections = { Chat: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] } };
    expect(findChatTriggerNode(agent, nodes, connections)).toBe(chat);
  });
});

describe('findChatReadyAgents', () => {
  it('returns only AI Agent nodes that have a Chat trigger attached', () => {
    const readyAgent = node('Ready Agent', 'aiAgent');
    const bareAgent = node('Bare Agent', 'aiAgent');
    const chat = node('Chat', 'chatTrigger');
    const nodes = [readyAgent, bareAgent, chat];
    const connections: IConnections = { Chat: { main: [[{ node: 'Ready Agent', type: 'main', index: 0 }]] } };

    expect(findChatReadyAgents(nodes, connections)).toEqual([readyAgent]);
  });

  it('ignores a Chat trigger connected to a non-agent node', () => {
    const other = node('Other', 'noOp');
    const chat = node('Chat', 'chatTrigger');
    const connections: IConnections = { Chat: { main: [[{ node: 'Other', type: 'main', index: 0 }]] } };

    expect(findChatReadyAgents([other, chat], connections)).toEqual([]);
  });
});
