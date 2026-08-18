import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import { MapNodeTypes } from '@n8n-clone/core';
import { WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { resumeApproval, resumeAskUser, runTurn } from './agent-loop.js';
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

let deleteHandlerCalls: string[] = [];
const deleteTool: ITool<{ name: string }, { deleted: true }> = {
  name: 'delete_thing',
  description: 'test gated tool',
  parameters: z.object({ name: z.string() }),
  requiresApproval: true,
  handler: (params) => {
    deleteHandlerCalls.push(params.name);
    return { deleted: true };
  },
};

function toolRegistry(tools: AnyTool[] = [echoTool as unknown as AnyTool]): Map<string, AnyTool> {
  return new Map(tools.map((t) => [t.name, t]));
}

function toolRegistryWithGate(): Map<string, AnyTool> {
  return toolRegistry([echoTool as unknown as AnyTool, deleteTool as unknown as AnyTool]);
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

describe('approval gates', () => {
  it('pauses before calling a requiresApproval tool, without executing it', async () => {
    deleteHandlerCalls = [];
    const provider = new ScriptedModelProvider([{ toolCalls: [{ id: 'call_1', name: 'delete_thing', arguments: '{"name":"Node A"}' }] }]);
    const events: AgentLoopEvent[] = [];

    const session = await runTurn(
      newSession(),
      'delete Node A',
      { modelProvider: provider, tools: toolRegistryWithGate(), toolContext: await makeToolContext() },
      { onEvent: (e) => events.push(e) },
    );

    expect(session.status).toBe('awaiting_approval');
    expect(session.pendingApproval).toEqual({ toolCallId: 'call_1', toolName: 'delete_thing', args: { name: 'Node A' }, remainingCalls: [] });
    expect(deleteHandlerCalls).toEqual([]);
    expect(events.at(-1)).toEqual({ type: 'turn_complete', stopReason: 'awaiting_approval' });
    expect(session.messages.filter((m) => m.role === 'tool')).toHaveLength(0);
  });

  it('resumeApproval("approve") executes the tool and continues the turn', async () => {
    deleteHandlerCalls = [];
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'delete_thing', arguments: '{"name":"Node A"}' }] },
      { text: 'Deleted Node A.' },
    ]);
    const deps = { modelProvider: provider, tools: toolRegistryWithGate(), toolContext: await makeToolContext() };
    const session = await runTurn(newSession(), 'delete Node A', deps);

    const resumed = await resumeApproval(session, 'approve', deps);

    expect(deleteHandlerCalls).toEqual(['Node A']);
    expect(resumed.status).toBe('idle');
    expect(resumed.pendingApproval).toBeUndefined();
    expect(resumed.messages.find((m) => m.role === 'tool')?.content).toBe(JSON.stringify({ deleted: true }));
    expect(resumed.messages.at(-1)).toEqual({ role: 'assistant', content: 'Deleted Node A.' });
  });

  it('resumeApproval("reject") does not execute the tool, and feeds a rejection back to the model', async () => {
    deleteHandlerCalls = [];
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'delete_thing', arguments: '{"name":"Node A"}' }] },
      { text: 'Understood, leaving it as is.' },
    ]);
    const deps = { modelProvider: provider, tools: toolRegistryWithGate(), toolContext: await makeToolContext() };
    const session = await runTurn(newSession(), 'delete Node A', deps);

    const resumed = await resumeApproval(session, 'reject', deps);

    expect(deleteHandlerCalls).toEqual([]);
    expect(JSON.parse(resumed.messages.find((m) => m.role === 'tool')!.content)).toMatchObject({ rejected: true });
    expect(resumed.messages.at(-1)).toEqual({ role: 'assistant', content: 'Understood, leaving it as is.' });
  });

  it('processes calls queued after the gated one once resumed, in order', async () => {
    deleteHandlerCalls = [];
    const provider = new ScriptedModelProvider([
      {
        toolCalls: [
          { id: 'call_1', name: 'echo', arguments: '{"value":"before"}' },
          { id: 'call_2', name: 'delete_thing', arguments: '{"name":"Node A"}' },
          { id: 'call_3', name: 'echo', arguments: '{"value":"after"}' },
        ],
      },
      { text: 'Done.' },
    ]);
    const deps = { modelProvider: provider, tools: toolRegistryWithGate(), toolContext: await makeToolContext() };
    const session = await runTurn(newSession(), 'go', deps);

    // The call before the gate already ran; the gate paused before running itself or the call after it.
    expect(session.messages.find((m) => m.role === 'tool' && m.toolCallId === 'call_1')).toBeDefined();
    expect(session.pendingApproval?.remainingCalls).toEqual([{ id: 'call_3', name: 'echo', arguments: '{"value":"after"}' }]);

    const resumed = await resumeApproval(session, 'approve', deps);

    expect(deleteHandlerCalls).toEqual(['Node A']);
    expect(resumed.messages.find((m) => m.role === 'tool' && m.toolCallId === 'call_3')?.content).toBe(
      JSON.stringify({ echoed: 'after' }),
    );
    expect(resumed.messages.at(-1)).toEqual({ role: 'assistant', content: 'Done.' });
  });

  it('resumeApproval throws when the session has no pending approval', async () => {
    const deps = { modelProvider: new ScriptedModelProvider([]), tools: toolRegistryWithGate(), toolContext: await makeToolContext() };
    await expect(resumeApproval(newSession(), 'approve', deps)).rejects.toThrow(/without a pending approval/);
  });
});

describe('ask_user', () => {
  it('pauses on an ask_user call instead of guessing, without a tool_result yet', async () => {
    const provider = new ScriptedModelProvider([
      {
        toolCalls: [
          {
            id: 'call_1',
            name: 'ask_user',
            arguments: JSON.stringify({ questions: [{ id: 'channel', question: 'Which Slack channel?', options: [{ label: '#sales', value: 'sales' }] }] }),
          },
        ],
      },
    ]);
    const events: AgentLoopEvent[] = [];

    const session = await runTurn(
      newSession(),
      'post to slack when this runs',
      { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() },
      { onEvent: (e) => events.push(e) },
    );

    expect(session.status).toBe('awaiting_user');
    expect(session.pendingQuestions).toEqual({
      toolCallId: 'call_1',
      questions: [{ id: 'channel', question: 'Which Slack channel?', options: [{ label: '#sales', value: 'sales' }] }],
      remainingCalls: [],
    });
    expect(events.at(-1)).toEqual({ type: 'turn_complete', stopReason: 'awaiting_user' });
    expect(session.messages.filter((m) => m.role === 'tool')).toHaveLength(0);
  });

  it('resumeAskUser feeds the answers back keyed by question id and continues the turn', async () => {
    const provider = new ScriptedModelProvider([
      {
        toolCalls: [
          { id: 'call_1', name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'channel', question: 'Which Slack channel?' }] }) },
        ],
      },
      { text: 'Using #sales.' },
    ]);
    const deps = { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() };
    const session = await runTurn(newSession(), 'post to slack when this runs', deps);

    const resumed = await resumeAskUser(session, { channel: 'sales' }, deps);

    expect(resumed.status).toBe('idle');
    expect(resumed.pendingQuestions).toBeUndefined();
    expect(resumed.messages.find((m) => m.role === 'tool')?.content).toBe(JSON.stringify({ channel: 'sales' }));
    expect(resumed.messages.at(-1)).toEqual({ role: 'assistant', content: 'Using #sales.' });
  });

  it('resumeAskUser throws when an answer is missing for a question id', async () => {
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'channel', question: 'Which channel?' }] }) }] },
    ]);
    const deps = { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() };
    const session = await runTurn(newSession(), 'go', deps);

    await expect(resumeAskUser(session, {}, deps)).rejects.toThrow(/Missing answers/);
  });

  it('feeds back a structured error and keeps going, without suspending, on malformed ask_user arguments', async () => {
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'call_1', name: 'ask_user', arguments: '{"not":"the right shape"}' }] },
      { text: 'Retrying with the right shape.' },
    ]);
    const session = await runTurn(newSession(), 'go', { modelProvider: provider, tools: toolRegistry(), toolContext: await makeToolContext() });

    expect(session.status).toBe('idle');
    expect(JSON.parse(session.messages.find((m) => m.role === 'tool')!.content)).toMatchObject({ code: 'INVALID_ARGS' });
    expect(session.messages.at(-1)).toEqual({ role: 'assistant', content: 'Retrying with the right shape.' });
  });
});
