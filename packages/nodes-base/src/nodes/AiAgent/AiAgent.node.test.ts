import { describe, expect, it } from 'vitest';
import { NodeOperationError } from '@n8n-clone/workflow';
import { MapNodeTypes } from '@n8n-clone/core';
import { aiAgent } from './AiAgent.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';
import type { IDataObject, INode, INodeType, ISupplyDataFunctions, IWorkflowBase } from '@n8n-clone/workflow';
import type { IAiTool, IChatModel, IChatToolCall } from '../shared/ai-types.js';

function makeFakeChatModel(responses: Array<{ content: string | null; toolCalls: IChatToolCall[] }>): INodeType {
  let call = 0;
  return {
    description: {
      displayName: 'Fake Chat Model',
      name: 'fakeChatModel',
      group: ['ai'],
      version: 1,
      description: 'test',
      defaults: { name: 'Fake Chat Model' },
      inputs: [],
      outputs: ['ai_languageModel'],
      properties: [],
    },
    async supplyData(this: ISupplyDataFunctions): Promise<IChatModel> {
      return {
        chat: async () => {
          const response = responses[call] ?? responses[responses.length - 1]!;
          call++;
          return response;
        },
      };
    },
  };
}

function makeFakeTool(name: string, invoke: (args: IDataObject) => Promise<string>): INodeType {
  return {
    description: {
      displayName: name,
      name: `fakeTool_${name}`,
      group: ['ai'],
      version: 1,
      description: 'test',
      defaults: { name },
      inputs: [],
      outputs: ['ai_tool'],
      properties: [],
    },
    async supplyData(this: ISupplyDataFunctions): Promise<IAiTool> {
      return { name, description: `test tool ${name}`, schema: {}, invoke };
    },
  };
}

function agentWorkflow(agent: INode, subNodes: Array<{ node: INode; type: 'ai_languageModel' | 'ai_tool' }>): IWorkflowBase {
  const connections: IWorkflowBase['connections'] = {};
  for (const { node, type } of subNodes) {
    connections[node.name] = { [type]: [[{ node: agent.name, type, index: 0 }]] };
  }
  return { id: 'wf-1', name: 'test', active: false, nodes: [agent, ...subNodes.map((s) => s.node)], connections };
}

describe('AI Agent node', () => {
  it('throws a clear error when no Chat Model is connected', async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'hi' } });
    const nodeTypes = new MapNodeTypes();
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, []),
      nodeTypes,
    });

    await expect(aiAgent.execute!.call(ctx)).rejects.toThrow(NodeOperationError);
    await expect(aiAgent.execute!.call(ctx)).rejects.toThrow(/No Chat Model connected/);
  });

  it("returns the model's immediate answer when it makes no tool calls", async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'What is 2+2?' } });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel' });
    const fakeChatModel = makeFakeChatModel([{ content: 'The answer is 4.', toolCalls: [] }]);

    const nodeTypes = new MapNodeTypes().register(fakeChatModel);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, [{ node: chatModel, type: 'ai_languageModel' }]),
      nodeTypes,
    });

    const result = await aiAgent.execute!.call(ctx);
    expect(result[0]).toEqual([{ json: { output: 'The answer is 4.', toolCalls: [] }, pairedItem: { item: 0 } }]);
  });

  it('calls a connected tool and feeds its result back for a second round', async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'What is 12 * 4?' } });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel' });
    const calculator = makeNode({ name: 'Calculator', type: 'fakeTool_calculator' });

    const fakeChatModel = makeFakeChatModel([
      { content: null, toolCalls: [{ id: 'call_1', name: 'calculator', arguments: '{"expression":"12 * 4"}' }] },
      { content: 'The answer is 48.', toolCalls: [] },
    ]);
    const fakeTool = makeFakeTool('calculator', async (args) => `Result: ${args.expression as string} = 48`);

    const nodeTypes = new MapNodeTypes().register(fakeChatModel).register(fakeTool);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, [
        { node: chatModel, type: 'ai_languageModel' },
        { node: calculator, type: 'ai_tool' },
      ]),
      nodeTypes,
    });

    const result = await aiAgent.execute!.call(ctx);
    expect(result[0]![0]!.json.output).toBe('The answer is 48.');
    expect(result[0]![0]!.json.toolCalls).toEqual([
      { tool: 'calculator', arguments: '{"expression":"12 * 4"}', result: 'Result: 12 * 4 = 48' },
    ]);
  });

  it('reports a tool error back to the model as its result, rather than crashing the node', async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'compute' } });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel' });
    const calculator = makeNode({ name: 'Calculator', type: 'fakeTool_calculator' });

    const fakeChatModel = makeFakeChatModel([
      { content: null, toolCalls: [{ id: 'call_1', name: 'calculator', arguments: '{"expression":"1/0/"}' }] },
      { content: 'Sorry, that failed.', toolCalls: [] },
    ]);
    const fakeTool = makeFakeTool('calculator', async () => {
      throw new Error('bad expression');
    });

    const nodeTypes = new MapNodeTypes().register(fakeChatModel).register(fakeTool);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, [
        { node: chatModel, type: 'ai_languageModel' },
        { node: calculator, type: 'ai_tool' },
      ]),
      nodeTypes,
    });

    const result = await aiAgent.execute!.call(ctx);
    expect(result[0]![0]!.json.output).toBe('Sorry, that failed.');
    expect((result[0]![0]!.json.toolCalls as IDataObject[])[0]!.result).toBe('Error: bad expression');
  });

  it('reports an error result when the model calls a tool that is not connected', async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'x' } });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel' });

    const fakeChatModel = makeFakeChatModel([
      { content: null, toolCalls: [{ id: 'call_1', name: 'ghostTool', arguments: '{}' }] },
      { content: 'done', toolCalls: [] },
    ]);

    const nodeTypes = new MapNodeTypes().register(fakeChatModel);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, [{ node: chatModel, type: 'ai_languageModel' }]),
      nodeTypes,
    });

    const result = await aiAgent.execute!.call(ctx);
    expect((result[0]![0]!.json.toolCalls as IDataObject[])[0]!.result).toBe('Error: no tool named "ghostTool" is connected.');
  });

  it('stops after maxIterations, returning the last content the model produced', async () => {
    const agent = makeNode({ name: 'Agent', type: 'aiAgent', parameters: { prompt: 'loop forever', maxIterations: 2 } });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel' });
    const calculator = makeNode({ name: 'Calculator', type: 'fakeTool_calculator' });

    // Every response keeps calling the tool — with maxIterations: 2, the loop must stop after
    // the 2nd round instead of continuing forever.
    const fakeChatModel = makeFakeChatModel([
      { content: 'still thinking', toolCalls: [{ id: 'call_1', name: 'calculator', arguments: '{}' }] },
    ]);
    const fakeTool = makeFakeTool('calculator', async () => 'ok');

    const nodeTypes = new MapNodeTypes().register(fakeChatModel).register(fakeTool);
    const ctx = makeExecuteFunctions([{ json: {} }], {
      node: agent,
      workflow: agentWorkflow(agent, [
        { node: chatModel, type: 'ai_languageModel' },
        { node: calculator, type: 'ai_tool' },
      ]),
      nodeTypes,
    });

    const result = await aiAgent.execute!.call(ctx);
    expect(result[0]![0]!.json.output).toBe('still thinking');
    expect((result[0]![0]!.json.toolCalls as IDataObject[])).toHaveLength(2);
  });
});
