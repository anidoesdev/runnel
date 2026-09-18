import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { WorkflowDraftStore } from '@runnel/workflow-tools';
import { resumeApproval, runTurn } from './agent-loop.js';
import { createSession } from './session.js';
import { ScriptedModelProvider } from './test-utils/scripted-model-provider.js';
import type { AnyTool, ITool, IToolContext } from '@runnel/workflow-tools';
import type { IWorkflowBase } from '@runnel/workflow';
import type { AgentLoopEvent } from './agent-loop.js';

/**
 * Part 5 Safety: "Credential values never enter the transcript. Enforce with a redaction pass
 * over every tool result plus a test that greps transcripts for known credential fixtures." This
 * is that test — a known fixture value, pushed through the real runTurn/resumeApproval paths (not
 * a unit test of redactDeep in isolation, which workflow-tools already has), grepped out of
 * both the persisted transcript and the live SSE-bound event stream.
 */

const CREDENTIAL_FIXTURE = 'sk-test-0123456789abcdef-do-not-leak-me';

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

/** Stands in for a future tool that carelessly echoes something secret-shaped back — e.g. an HTTP call that returns the auth header it sent, or a credential-adjacent object nested a few levels deep. */
const leakyTool: ITool<Record<string, never>, unknown> = {
  name: 'leaky_tool',
  description: 'test tool that returns credential-shaped data',
  parameters: z.object({}),
  handler: () => ({
    ok: true,
    apiKey: CREDENTIAL_FIXTURE,
    headers: { Authorization: `Bearer ${CREDENTIAL_FIXTURE}` },
    nested: { deeply: { credentialToken: CREDENTIAL_FIXTURE } },
  }),
};

const gatedLeakyTool: ITool<Record<string, never>, unknown> = {
  ...leakyTool,
  name: 'gated_leaky_tool',
  requiresApproval: true,
};

function newSession() {
  return createSession({ id: 's1', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: [] }, tokenLimit: 100_000 });
}

function transcriptText(session: { messages: Array<{ content: string }> }): string {
  return session.messages.map((m) => m.content).join('\n');
}

describe('agent loop — credential redaction', () => {
  it('never lets a known credential fixture reach session.messages, no matter how deeply nested', async () => {
    const toolContext = await makeToolContext();
    const tools = new Map<string, AnyTool>([[leakyTool.name, leakyTool as unknown as AnyTool]]);
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'leaky_tool', arguments: '{}' }] },
      { text: 'Done.' },
    ]);

    const finished = await runTurn(newSession(), 'do the thing', { modelProvider: provider, tools, toolContext });

    expect(transcriptText(finished)).not.toContain(CREDENTIAL_FIXTURE);
    expect(transcriptText(finished)).toContain('[redacted]');
  });

  it('never emits a known credential fixture through the live onEvent stream either', async () => {
    const toolContext = await makeToolContext();
    const tools = new Map<string, AnyTool>([[leakyTool.name, leakyTool as unknown as AnyTool]]);
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'leaky_tool', arguments: '{}' }] },
      { text: 'Done.' },
    ]);

    const events: AgentLoopEvent[] = [];
    await runTurn(newSession(), 'do the thing', { modelProvider: provider, tools, toolContext }, { onEvent: (e) => events.push(e) });

    expect(JSON.stringify(events)).not.toContain(CREDENTIAL_FIXTURE);
  });

  it('also redacts a gated tool\'s result on the resumeApproval path', async () => {
    const toolContext = await makeToolContext();
    const tools = new Map<string, AnyTool>([[gatedLeakyTool.name, gatedLeakyTool as unknown as AnyTool]]);
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'gated_leaky_tool', arguments: '{}' }] },
      { text: 'Done.' },
    ]);

    const afterCall = await runTurn(newSession(), 'do the gated thing', { modelProvider: provider, tools, toolContext });
    expect(afterCall.status).toBe('awaiting_approval');

    const finished = await resumeApproval(afterCall, 'approve', { modelProvider: provider, tools, toolContext });

    expect(transcriptText(finished)).not.toContain(CREDENTIAL_FIXTURE);
    expect(transcriptText(finished)).toContain('[redacted]');
  });
});
