import { afterEach, describe, expect, it } from 'vitest';
import { MapNodeTypes, WorkflowExecute } from '@runnel/core';
import { Workflow } from '@runnel/workflow';
import { registerAllNodeTypes } from './index.js';
import { startTestServer, readRequestBody } from './test-server.js';
import type { IDataObject, IWorkflowBase } from '@runnel/workflow';
import type { TestServer } from './test-server.js';

/**
 * Proves the whole AI Agent feature end to end, across every layer touched to build it: the
 * `ai_languageModel`/`ai_tool` sub-node connection types (packages/workflow), getInputConnectionData
 * resolving supplyData() through the real engine (packages/core), and the three new node types
 * (packages/nodes-base) — wired together exactly as the editor would save them, executed through
 * the real WorkflowExecute, with a local HTTP server standing in for the OpenAI API.
 *
 * Graph:
 *   Manual Trigger --main--> AI Agent
 *   Chat Model --ai_languageModel--> AI Agent
 *   Calculator --ai_tool--> AI Agent
 */
function buildWorkflow(): IWorkflowBase {
  return {
    id: 'ai-agent-workflow',
    name: 'AI Agent Workflow',
    active: false,
    nodes: [
      { id: '1', name: 'Manual Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
      {
        id: '2',
        name: 'AI Agent',
        type: 'aiAgent',
        typeVersion: 1,
        position: [1, 0],
        parameters: { systemPrompt: 'You are a helpful assistant.', prompt: 'What is 6 times 7?' },
      },
      {
        id: '3',
        name: 'Chat Model',
        type: 'lmChatOpenAi',
        typeVersion: 1,
        position: [1, 1],
        parameters: { model: 'gpt-4o-mini' },
        credentials: { openAiApi: { id: 'cred-1', name: 'OpenAI account' } },
      },
      { id: '4', name: 'Calculator', type: 'toolCalculator', typeVersion: 1, position: [1, 2], parameters: {} },
    ],
    connections: {
      'Manual Trigger': { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] },
      'Chat Model': { ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]] },
      Calculator: { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] },
    },
  };
}

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('AI Agent + OpenAI Chat Model + Calculator Tool (end to end)', () => {
  it('reasons in a loop: asks the model, calls the connected Calculator tool, feeds the result back, and returns the final answer', async () => {
    let callCount = 0;
    const receivedBodies: IDataObject[] = [];

    server = await startTestServer((req, res) => {
      void readRequestBody(req).then((raw) => {
        receivedBodies.push(JSON.parse(raw) as IDataObject);
        callCount++;
        res.writeHead(200, { 'content-type': 'application/json' });
        if (callCount === 1) {
          res.end(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [
                      { id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"6 * 7"}' } },
                    ],
                  },
                },
              ],
            }),
          );
        } else {
          res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '6 times 7 is 42.' } }] }));
        }
      });
    });

    const workflowDef = buildWorkflow();
    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const workflowExecute = new WorkflowExecute(nodeTypes, {
      mode: 'manual',
      sleep: async () => {},
      credentialsResolver: async (type) => {
        if (type !== 'openAiApi') throw new Error(`Unexpected credential type "${type}"`);
        return { apiKey: 'test-api-key', baseUrl: server!.url };
      },
    });

    const result = await workflowExecute.run(workflowDef, 'Manual Trigger');

    expect(result.resultData.error).toBeUndefined();
    expect(callCount).toBe(2);

    const agentRuns = result.resultData.runData['AI Agent']!;
    expect(agentRuns).toHaveLength(1);
    const agentOutput = agentRuns[0]!.data!.main[0]!;
    expect(agentOutput).toHaveLength(1);
    expect(agentOutput[0]!.json.output).toBe('6 times 7 is 42.');
    expect(agentOutput[0]!.json.toolCalls).toEqual([
      { tool: 'calculator', arguments: '{"expression":"6 * 7"}', result: '42' },
    ]);

    // Chat Model and Calculator never enter the main execution queue — they're pure sub-nodes,
    // resolved on demand by the Agent, not scheduled nodes with their own recorded run.
    expect(result.resultData.runData['Chat Model']).toBeUndefined();
    expect(result.resultData.runData.Calculator).toBeUndefined();

    // The system + user prompt on round 1, and the full tool round-trip on round 2.
    expect(receivedBodies[0]!.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 6 times 7?' },
    ]);
    expect(receivedBodies[1]!.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is 6 times 7?' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"6 * 7"}' } }],
      },
      { role: 'tool', content: '42', tool_call_id: 'call_1' },
    ]);
  });

  it("surviving 'Run to Here' pruning: pruning to the AI Agent node keeps its connected Chat Model and Tool", () => {
    const workflowDef = buildWorkflow();
    const pruned = new Workflow(workflowDef).pruneToDestination('AI Agent');

    expect(pruned.nodes.map((n) => n.name).sort()).toEqual(['AI Agent', 'Calculator', 'Chat Model', 'Manual Trigger']);
  });
});
