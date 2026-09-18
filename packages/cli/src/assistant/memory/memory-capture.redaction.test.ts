import { describe, expect, it, vi } from 'vitest';
import { createSession } from '@runnel/assistant';
import { MemnestMemoryAdapter } from './memnest-memory.adapter.js';
import type { IAssistantSession } from '@runnel/assistant';
import type { IMemnestForAssistant } from './memnest-memory.adapter.js';

/**
 * Mirrors packages/assistant/src/agent-loop.redaction.test.ts for the memory path: known
 * credential fixtures in a session must never reach Memnest. The engine is a spy, so what's
 * asserted is Runnel's own redaction and filtering — Memnest's redaction is a second layer these
 * tests deliberately don't get to lean on.
 */

const CREDENTIAL_FIXTURE = 'sk-test-0123456789abcdef-do-not-leak-me';
const PASSWORD_FIXTURE = 'hunter2-correct-horse';
const BEARER_FIXTURE = 'abcdef0123456789bearer-fixture';
const CONNECTION_PASSWORD_FIXTURE = 'pg-prod-password-fixture';
const TOOL_ONLY_FIXTURE = 'tool-result-only-value-7f3a';

const ALL_FIXTURES = [CREDENTIAL_FIXTURE, PASSWORD_FIXTURE, BEARER_FIXTURE, CONNECTION_PASSWORD_FIXTURE, TOOL_ONLY_FIXTURE];

function spyMemnest() {
  return {
    add: vi.fn(async () => ({ documentId: 'doc_1', status: 'indexed' as const, version: 1, deduplicated: false })),
    search: vi.fn(async () => ({ memories: [], chunks: [], trace: { query: '', candidates: [], budget: { limit: 400, used: 0 }, timings: {} } })),
  } satisfies IMemnestForAssistant;
}

function leakySession(): IAssistantSession {
  const session = createSession({ id: 's1', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: [] }, tokenLimit: 100_000 });
  session.messages = [
    { role: 'user', content: `Call the API with my key ${CREDENTIAL_FIXTURE}. Always verify HMAC on webhooks.` },
    {
      role: 'assistant',
      content: 'Setting up the HTTP Request node.',
      toolCalls: [{ id: 'c1', name: 'set_node_parameters', arguments: JSON.stringify({ headers: { Authorization: `Bearer ${BEARER_FIXTURE}` } }) }],
    },
    { role: 'tool', toolCallId: 'c1', content: JSON.stringify({ ok: true, echoed: TOOL_ONLY_FIXTURE, apiKey: CREDENTIAL_FIXTURE }) },
    { role: 'user', content: `The database password is ${PASSWORD_FIXTURE}, url postgres://admin:${CONNECTION_PASSWORD_FIXTURE}@db:5432/app` },
    { role: 'assistant', content: `Configured: {"apiKey": "${CREDENTIAL_FIXTURE}", "header": "Bearer ${BEARER_FIXTURE}"}` },
  ];
  return session;
}

async function capturedPayload(session: IAssistantSession) {
  const memnest = spyMemnest();
  await new MemnestMemoryAdapter(memnest).capture(session);
  expect(memnest.add).toHaveBeenCalledTimes(1);
  return (memnest.add.mock.calls[0] as unknown as [Parameters<IMemnestForAssistant['add']>[0]])[0];
}

describe('memory capture — credential redaction', () => {
  it('never hands a known credential fixture to Memnest, from any message', async () => {
    const payload = JSON.stringify(await capturedPayload(leakySession()));

    for (const fixture of ALL_FIXTURES) expect(payload).not.toContain(fixture);
    expect(payload).toContain('[redacted]');
  });

  it('keeps the durable, non-secret part of what the user said', async () => {
    const payload = await capturedPayload(leakySession());
    expect(JSON.stringify(payload.content)).toContain('Always verify HMAC on webhooks.');
  });
});

describe('memory capture — tool traffic excluded', () => {
  it('sends only user and assistant text: no tool results, no tool calls', async () => {
    const payload = await capturedPayload(leakySession());
    const turns = payload.content as unknown as Array<Record<string, unknown>>;

    expect(turns.map((turn) => turn.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    for (const turn of turns) expect(Object.keys(turn).sort()).toEqual(['content', 'role']);

    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('set_node_parameters');
    expect(serialized).not.toContain('echoed');
    expect(serialized).not.toContain(TOOL_ONLY_FIXTURE);
  });

  it('tags the capture with the user container, the session id, and workflow metadata', async () => {
    const payload = await capturedPayload(leakySession());
    expect(payload).toMatchObject({ containerTag: 'user:u1', customId: 's1', metadata: { workflowId: 'wf-1', draftId: 'd1' } });
  });

  it('skips Memnest entirely when a session has no text to remember', async () => {
    const session = createSession({ id: 's2', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: [] }, tokenLimit: 100_000 });
    session.messages = [{ role: 'tool', toolCallId: 'c1', content: '{"ok":true}' }];
    const memnest = spyMemnest();

    await new MemnestMemoryAdapter(memnest).capture(session);

    expect(memnest.add).not.toHaveBeenCalled();
  });
});

describe('memory — missing userId', () => {
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['the unauthenticated fallback', 'unknown'],
    ['undefined', undefined as unknown as string],
  ])('%s userId → throws before any Memnest call and never builds a tag', async (_label, userId) => {
    const memnest = spyMemnest();
    const adapter = new MemnestMemoryAdapter(memnest);
    const session = leakySession();
    session.actor = { userId, scopes: [] };

    await expect(adapter.recall('webhooks', session.actor, 400)).rejects.toThrow(/userId/);
    await expect(adapter.capture(session)).rejects.toThrow(/userId/);
    expect(memnest.search).not.toHaveBeenCalled();
    expect(memnest.add).not.toHaveBeenCalled();
  });
});
