import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { MapNodeTypes } from '@n8n-clone/core';
import { WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { runTurn } from './agent-loop.js';
import { createSession } from './session.js';
import { ScriptedModelProvider } from './test-utils/scripted-model-provider.js';
import type { AnyTool, ITool, IToolContext } from '@n8n-clone/workflow-tools';
import type { IWorkflowBase } from '@n8n-clone/workflow';
import type { AgentLoopEvent } from './agent-loop.js';

function fakeRepository() {
  const workflow: IWorkflowBase = { id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} };
  return {
    async get() {
      return structuredClone(workflow);
    },
    async save(_id: string, next: IWorkflowBase) {
      return structuredClone(next);
    },
  };
}

async function makeToolContext(): Promise<IToolContext> {
  const draftStore = new WorkflowDraftStore(fakeRepository());
  const draft = await draftStore.open('wf-1');
  return { draftId: draft.id, nodeTypes: new MapNodeTypes(), draftStore };
}

const echoTool: ITool<{ value: string }, { echoed: string }> = {
  name: 'echo',
  description: 'test tool',
  parameters: z.object({ value: z.string() }),
  handler: (params) => ({ echoed: params.value }),
};

function toolRegistry(tools: AnyTool[] = [echoTool as unknown as AnyTool]): Map<string, AnyTool> {
  return new Map(tools.map((t) => [t.name, t]));
}

function newSession() {
  return createSession({ id: 's1', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: [] }, tokenLimit: 100_000 });
}

describe('runTurn', () => {
  it('handles a plain text turn with no tool calls', async () => {
    const provider = new ScriptedModelProvider([{ text: 'Hello there.' }]);
    const session = await runTurn(newSession(), 'hi', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() });

    expect(session.status).toBe('idle');
    expect(session.messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Hello there.' },
    ]);
  });

  it('dispatches a tool call, appends the result, and loops back to the model', async () => {
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'echo', arguments: '{"value":"ping"}' }] },
      { text: 'Done.' },
    ]);
    const session = await runTurn(newSession(), 'echo ping', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() });

    expect(session.messages).toEqual([
      { role: 'user', content: 'echo ping' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'echo', arguments: '{"value":"ping"}' }] },
      { role: 'tool', toolCallId: 'call_1', content: JSON.stringify({ echoed: 'ping' }) },
      { role: 'assistant', content: 'Done.' },
    ]);
  });

  it('feeds a structured tool error back to the model instead of throwing', async () => {
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'no_such_tool', arguments: '{}' }] },
      { text: 'Fixed it.' },
    ]);
    const session = await runTurn(newSession(), 'do something', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() });

    const toolResultMessage = session.messages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolResultMessage!.content)).toMatchObject({ code: 'UNKNOWN_TOOL' });
    expect(session.messages.at(-1)).toEqual({ role: 'assistant', content: 'Fixed it.' });
  });

  it('accumulates token usage across model calls', async () => {
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'echo', arguments: '{"value":"a"}' }], usage: { inputTokens: 100, outputTokens: 10 } },
      { text: 'done', usage: { inputTokens: 120, outputTokens: 5 } },
    ]);
    const session = await runTurn(newSession(), 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() });

    expect(session.tokenBudget.used).toBe(100 + 10 + 120 + 5);
  });

  it('stops immediately with token_budget_exceeded when the session is already over budget, without calling the model', async () => {
    const provider = new ScriptedModelProvider([{ text: 'should not be reached' }]);
    const session = newSession();
    session.tokenBudget = { used: 100, limit: 100 };
    const events: AgentLoopEvent[] = [];

    await runTurn(session, 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() }, { onEvent: (e) => events.push(e) });

    expect(events.at(-1)).toEqual({ type: 'turn_complete', stopReason: 'token_budget_exceeded' });
    expect(session.messages).toHaveLength(1); // just the appended user message
  });

  it('stops immediately with wall_clock_exceeded when the deadline has already passed', async () => {
    const provider = new ScriptedModelProvider([{ text: 'should not be reached' }]);
    const events: AgentLoopEvent[] = [];

    await runTurn(newSession(), 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() }, { wallClockMs: -1, onEvent: (e) => events.push(e) });

    expect(events.at(-1)).toEqual({ type: 'turn_complete', stopReason: 'wall_clock_exceeded' });
  });

  it('stops immediately with aborted when the signal is already aborted', async () => {
    const provider = new ScriptedModelProvider([{ text: 'should not be reached' }]);
    const controller = new AbortController();
    controller.abort();

    const session = await runTurn(newSession(), 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() }, { signal: controller.signal });

    expect(session.messages).toHaveLength(1);
  });

  it('caps tool calls at maxToolCalls, reporting the excess as errors rather than executing them', async () => {
    const provider = new ScriptedModelProvider([
      {
        toolCalls: [
          { id: 'call_1', name: 'echo', arguments: '{"value":"a"}' },
          { id: 'call_2', name: 'echo', arguments: '{"value":"b"}' },
          { id: 'call_3', name: 'echo', arguments: '{"value":"c"}' },
        ],
      },
    ]);
    const events: AgentLoopEvent[] = [];

    const session = await runTurn(
      newSession(),
      'go',
      { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() },
      { maxToolCalls: 2, onEvent: (e) => events.push(e) },
    );

    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'tool_error')).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: 'turn_complete', stopReason: 'tool_call_budget_exceeded' });
    expect(session.status).toBe('idle');
  });

  it('sets session.status to error and rethrows when the provider itself fails', async () => {
    const failingProvider = {
      // eslint-disable-next-line require-yield -- deliberately throws before any yield, to simulate the provider itself failing
      stream: vi.fn().mockImplementation(async function* () {
        throw new Error('network down');
      }),
    };

    const session = newSession();
    await expect(
      runTurn(session, 'go', { modelProvider: failingProvider, tools: toolRegistry(), toolContext: await makeToolContext() }),
    ).rejects.toThrow('network down');
    expect(session.status).toBe('error');
  });

  it('emits text_delta, tool_call, tool_result, and turn_complete events in order', async () => {
    const provider = new ScriptedModelProvider([
      { text: 'Working on it.', toolCalls: [{ id: 'call_1', name: 'echo', arguments: '{"value":"x"}' }] },
      { text: 'Done.' },
    ]);
    const events: AgentLoopEvent[] = [];

    await runTurn(newSession(), 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() }, { onEvent: (e) => events.push(e) });

    expect(events.map((e) => e.type)).toEqual(['text_delta', 'tool_call', 'tool_result', 'text_delta', 'turn_complete']);
  });
});
