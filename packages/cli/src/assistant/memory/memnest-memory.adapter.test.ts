import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemnest, scopeOf } from '@memnest/core';
import { createSqliteStore } from '@memnest/store-sqlite';
import { createSession } from '@runnel/assistant';
import { MemnestMemoryAdapter } from './memnest-memory.adapter.js';
import type { Memnest } from '@memnest/core';
import type { SqliteStore } from '@memnest/store-sqlite';

/**
 * The adapter against the real engine on the SQLite store — Runnel's default setup, where the
 * store has no vector search at all, so every recall here is the degraded lexical-only path.
 * No completion provider: memories are written directly, so nothing depends on a model.
 */

let memnest: Memnest | undefined;

afterEach(async () => {
  await memnest?.close();
  memnest = undefined;
});

function realEngine(): { memnest: Memnest; store: SqliteStore } {
  const store = createSqliteStore({ filename: ':memory:', autoMigrate: true });
  memnest = createMemnest({ store });
  return { memnest, store };
}

const alice = { userId: 'alice', scopes: [] };
const bob = { userId: 'bob', scopes: [] };

describe('MemnestMemoryAdapter on SQLite (lexical only)', () => {
  it('store reports no vector capability', () => {
    const { store } = realEngine();
    expect(store.capabilities().vector).toBe(false);
  });

  it("scope: a user's recall never returns another user's memories", async () => {
    const { memnest } = realEngine();
    await memnest.addMemories({
      containerTag: 'user:alice',
      memories: [{ content: 'Alice wants webhook nodes to verify HMAC signatures.', kind: 'preference' }],
    });
    await memnest.addMemories({
      containerTag: 'user:bob',
      memories: [{ content: 'Bob wants webhook nodes to skip HMAC signatures entirely.', kind: 'preference' }],
    });
    const adapter = new MemnestMemoryAdapter(memnest);

    const forAlice = await adapter.recall('webhook HMAC signatures', alice, 400);
    const forBob = await adapter.recall('webhook HMAC signatures', bob, 400);

    expect(forAlice.memories.map((m) => m.content)).toEqual(['Alice wants webhook nodes to verify HMAC signatures.']);
    expect(forBob.memories.map((m) => m.content)).toEqual(['Bob wants webhook nodes to skip HMAC signatures entirely.']);
  });

  it('degraded: recall still returns results, and the trace records lexical-only', async () => {
    const { memnest } = realEngine();
    await memnest.addMemories({
      containerTag: 'user:alice',
      memories: [{ content: 'Alice names every node in snake_case.', kind: 'preference' }],
    });

    const recalled = await new MemnestMemoryAdapter(memnest).recall('snake_case node names', alice, 400);

    expect(recalled.memories).toEqual([expect.objectContaining({ content: 'Alice names every node in snake_case.', kind: 'preference' })]);
    expect(recalled.tokensUsed).toBeGreaterThan(0);
    expect((recalled.trace as { degraded?: string }).degraded).toMatch(/lexical-only/);
  });

  it('respects the token budget', async () => {
    const { memnest } = realEngine();
    await memnest.addMemories({
      containerTag: 'user:alice',
      memories: Array.from({ length: 20 }, (_, i) => ({
        content: `Alice webhook preference number ${i}: ${'always verify signatures and log the payload. '.repeat(4)}`,
        kind: 'preference' as const,
      })),
    });

    const recalled = await new MemnestMemoryAdapter(memnest).recall('Alice webhook preference', alice, 60);

    expect(recalled.memories.length).toBeGreaterThan(0);
    expect(recalled.memories.length).toBeLessThan(20);
    expect(recalled.tokensUsed).toBeLessThanOrEqual(60);
  });

  it('idempotent capture: the same session captured twice is stored once', async () => {
    const { memnest, store } = realEngine();
    const add = vi.spyOn(memnest, 'add');
    const adapter = new MemnestMemoryAdapter(memnest);
    const session = createSession({ id: 'session-1', workflowId: 'wf-1', draftId: 'd1', actor: alice, tokenLimit: 100_000 });
    session.messages = [
      { role: 'user', content: 'Always verify HMAC on webhooks.' },
      { role: 'assistant', content: 'Understood.' },
    ];

    await adapter.capture(session);
    await adapter.capture(session);

    const results = await Promise.all(add.mock.results.map((result) => result.value));
    expect(results.map((result) => result.deduplicated)).toEqual([false, true]);
    const documents = await store.findDocuments(scopeOf('user:alice'), { customId: 'session-1' });
    expect(documents).toHaveLength(1);
  });

  it('a grown session becomes a new version of the same document, not a second document', async () => {
    const { memnest, store } = realEngine();
    const adapter = new MemnestMemoryAdapter(memnest);
    const session = createSession({ id: 'session-2', workflowId: 'wf-1', draftId: 'd1', actor: alice, tokenLimit: 100_000 });
    session.messages = [{ role: 'user', content: 'Always verify HMAC on webhooks.' }];
    await adapter.capture(session);

    session.messages.push({ role: 'assistant', content: 'Will do.' });
    await adapter.capture(session);

    const latest = await store.findDocuments(scopeOf('user:alice'), { customId: 'session-2', latestOnly: true });
    expect(latest).toHaveLength(1);
    expect(latest[0]?.version).toBe(2);
  });
});
