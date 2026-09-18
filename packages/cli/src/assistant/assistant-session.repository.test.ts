import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSession } from '@runnel/assistant';
import { AssistantSessionRepositoryAdapter } from './assistant-session.repository.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { AssistantSessionEntity } from '../db/entities/AssistantSession.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { IAssistantSession } from '@runnel/assistant';

describe('AssistantSessionRepositoryAdapter', () => {
  let dataSource: DataSource;
  let sessions: Repository<AssistantSessionEntity>;
  let adapter: AssistantSessionRepositoryAdapter;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    sessions = dataSource.getRepository(AssistantSessionEntity);
    adapter = new AssistantSessionRepositoryAdapter(sessions);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  function freshSession(): IAssistantSession {
    return createSession({ id: 's1', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: ['owner'] }, tokenLimit: 100_000 });
  }

  it('create() then get() round-trips the full session, including nested objects', async () => {
    const session = freshSession();
    session.messages.push({ role: 'user', content: 'hello' });

    await adapter.create(session);
    const fetched = await adapter.get('s1');

    expect(fetched).toEqual(session);
  });

  it('get() returns undefined for an unknown session, not an error', async () => {
    expect(await adapter.get('nope')).toBeUndefined();
  });

  it('save() persists an updated session, including pendingApproval / pendingQuestions', async () => {
    const session = freshSession();
    await adapter.create(session);

    session.status = 'awaiting_approval';
    session.pendingApproval = { toolCallId: 'call_1', toolName: 'remove_node', args: { name: 'A' }, remainingCalls: [] };
    await adapter.save(session);

    const fetched = await adapter.get('s1');
    expect(fetched?.status).toBe('awaiting_approval');
    expect(fetched?.pendingApproval).toEqual({ toolCallId: 'call_1', toolName: 'remove_node', args: { name: 'A' }, remainingCalls: [] });
  });

  it('save() clears pendingApproval back to undefined once resolved', async () => {
    const session = freshSession();
    session.status = 'awaiting_approval';
    session.pendingApproval = { toolCallId: 'call_1', toolName: 'remove_node', args: {}, remainingCalls: [] };
    await adapter.create(session);

    session.status = 'idle';
    session.pendingApproval = undefined;
    await adapter.save(session);

    const fetched = await adapter.get('s1');
    expect(fetched?.pendingApproval).toBeUndefined();
  });

  it('save() throws NotFoundError for a session that was never created', async () => {
    await expect(adapter.save(freshSession())).rejects.toMatchObject({ statusCode: 404 });
  });
});
