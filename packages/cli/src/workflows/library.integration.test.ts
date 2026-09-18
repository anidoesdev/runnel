import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import { createLogger } from '../logging/logger.js';
import { purgeExpiredTrash, TRASH_RETENTION_DAYS } from './trash.js';
import type { DataSource } from 'typeorm';
import type { Express } from 'express';

/**
 * The library features behind the editor's formerly-disabled controls — starring, trash,
 * folders, notifications and settings — exercised over HTTP against a real in-memory SQLite
 * database, the same way assistant.controller.integration.test.ts does.
 */

let dataSource: DataSource;
let app: Express;
let agent: ReturnType<typeof request.agent>;

beforeEach(async () => {
  dataSource = createDataSource(sqliteConfig(':memory:'));
  await dataSource.initialize();
  await dataSource.runMigrations();
  ({ app } = createApp({
    dataSource,
    encryptionKey: 'test-encryption-key',
    jwtSecret: new TextEncoder().encode('test-jwt-secret-at-least-32-bytes!'),
    logger: createLogger({ level: 'silent' }),
    systemInfo: { database: 'sqlite', customNodesDir: '/custom/nodes' },
  }));
  agent = request.agent(app);
  await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });
});

afterEach(async () => {
  await dataSource.destroy();
});

async function createWorkflow(name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await agent.post('/rest/workflows').send({ name, nodes: [], connections: {}, ...extra });
  expect(res.status).toBe(200);
  return (res.body as { id: string }).id;
}

async function listWorkflows(query = ''): Promise<Array<{ id: string; name: string; starred: boolean; folderId: string | null }>> {
  const res = await agent.get(`/rest/workflows${query}`);
  expect(res.status).toBe(200);
  return res.body as Array<{ id: string; name: string; starred: boolean; folderId: string | null }>;
}

describe('starring', () => {
  it('stars a workflow and filters the library down to starred ones', async () => {
    const starred = await createWorkflow('Starred one');
    await createWorkflow('Plain one');

    const patched = await agent.patch(`/rest/workflows/${starred}`).send({ starred: true });
    expect(patched.status).toBe(200);
    expect((patched.body as { starred: boolean }).starred).toBe(true);

    expect((await listWorkflows('?view=starred')).map((w) => w.name)).toEqual(['Starred one']);
    expect((await listWorkflows()).map((w) => w.name).sort()).toEqual(['Plain one', 'Starred one']);
  });

  it('unstars again', async () => {
    const id = await createWorkflow('Toggle me');
    await agent.patch(`/rest/workflows/${id}`).send({ starred: true });
    await agent.patch(`/rest/workflows/${id}`).send({ starred: false });
    expect(await listWorkflows('?view=starred')).toEqual([]);
  });
});

describe('trash', () => {
  it('delete moves a workflow to the trash instead of destroying it', async () => {
    const id = await createWorkflow('Deleted later');

    expect((await agent.delete(`/rest/workflows/${id}`)).status).toBe(204);

    expect(await listWorkflows()).toEqual([]);
    expect((await listWorkflows('?view=trash')).map((w) => w.name)).toEqual(['Deleted later']);
    // Gone from every normal route, so nothing can edit or run what the user deleted.
    expect((await agent.get(`/rest/workflows/${id}`)).status).toBe(404);
    expect((await agent.patch(`/rest/workflows/${id}`).send({ name: 'Nope' })).status).toBe(404);
    expect((await agent.post(`/rest/workflows/${id}/execute`).send({})).status).toBe(404);
  });

  it('restores a workflow from the trash, inactive', async () => {
    const id = await createWorkflow('Back again');
    await agent.delete(`/rest/workflows/${id}`);

    const restored = await agent.post(`/rest/workflows/${id}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ deletedAt: null, active: false });

    expect((await listWorkflows()).map((w) => w.name)).toEqual(['Back again']);
    expect(await listWorkflows('?view=trash')).toEqual([]);
    expect((await agent.get(`/rest/workflows/${id}`)).status).toBe(200);
  });

  it('permanently deletes from the trash', async () => {
    const id = await createWorkflow('Really gone');
    await agent.delete(`/rest/workflows/${id}`);

    expect((await agent.delete(`/rest/workflows/${id}/permanent`)).status).toBe(204);

    expect(await listWorkflows('?view=trash')).toEqual([]);
    expect((await agent.post(`/rest/workflows/${id}/restore`)).status).toBe(404);
  });

  it(`purges workflows trashed more than ${TRASH_RETENTION_DAYS} days ago, and keeps newer ones`, async () => {
    const old = await createWorkflow('Ancient');
    const recent = await createWorkflow('Recent');
    await agent.delete(`/rest/workflows/${old}`);
    await agent.delete(`/rest/workflows/${recent}`);

    const longAgo = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    await dataSource.query('UPDATE workflow SET deletedAt = ? WHERE id = ?', [longAgo, old]);

    const purged = await purgeExpiredTrash(dataSource.getRepository(WorkflowEntity));

    expect(purged).toBe(1);
    expect((await listWorkflows('?view=trash')).map((w) => w.name)).toEqual(['Recent']);
  });

  it('purges as a side effect of listing the trash', async () => {
    const id = await createWorkflow('Ancient');
    await agent.delete(`/rest/workflows/${id}`);
    const longAgo = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    await dataSource.query('UPDATE workflow SET deletedAt = ? WHERE id = ?', [longAgo, id]);

    expect(await listWorkflows('?view=trash')).toEqual([]);
  });
});

describe('folders', () => {
  async function createFolder(name: string): Promise<string> {
    const res = await agent.post('/rest/folders').send({ name });
    expect(res.status).toBe(200);
    return (res.body as { id: string }).id;
  }

  it('creates, lists, renames and assigns workflows', async () => {
    const folderId = await createFolder('API Integrations');
    const inFolder = await createWorkflow('Stripe sync', { folderId });
    await createWorkflow('Loose workflow');

    expect((await agent.get('/rest/folders')).body).toEqual([expect.objectContaining({ id: folderId, name: 'API Integrations' })]);
    expect((await listWorkflows(`?folderId=${folderId}`)).map((w) => w.name)).toEqual(['Stripe sync']);

    const renamed = await agent.patch(`/rest/folders/${folderId}`).send({ name: 'Integrations' });
    expect((renamed.body as { name: string }).name).toBe('Integrations');

    // Moving a workflow out again.
    await agent.patch(`/rest/workflows/${inFolder}`).send({ folderId: null });
    expect(await listWorkflows(`?folderId=${folderId}`)).toEqual([]);
  });

  it('deleting a folder keeps its workflows and unfiles them', async () => {
    const folderId = await createFolder('Doomed');
    await createWorkflow('Survivor', { folderId });

    expect((await agent.delete(`/rest/folders/${folderId}`)).status).toBe(204);

    expect((await agent.get('/rest/folders')).body).toEqual([]);
    const all = await listWorkflows();
    expect(all.map((w) => w.name)).toEqual(['Survivor']);
    expect(all[0]?.folderId).toBeNull();
  });

  it('rejects an empty folder name', async () => {
    expect((await agent.post('/rest/folders').send({ name: '' })).status).toBe(400);
  });
});

describe('notifications', () => {
  async function feed(): Promise<{ items: Array<{ type: string; workflowName: string; readAt: string | null }>; unreadCount: number }> {
    const res = await agent.get('/rest/notifications');
    expect(res.status).toBe(200);
    return res.body as { items: Array<{ type: string; workflowName: string; readAt: string | null }>; unreadCount: number };
  }

  it('records activation and deactivation, and counts them as unread', async () => {
    const id = await createWorkflow('Webhook flow', {
      nodes: [{ id: 'n1', name: 'Webhook', type: 'webhook', typeVersion: 1, position: [0, 0], parameters: { path: 'lib-test', httpMethod: 'GET' } }],
    });

    await agent.patch(`/rest/workflows/${id}`).send({ active: true });
    await agent.patch(`/rest/workflows/${id}`).send({ active: false });

    const { items, unreadCount } = await feed();
    expect(items.map((n) => n.type)).toEqual(['workflow_deactivated', 'workflow_activated']);
    expect(items.every((n) => n.workflowName === 'Webhook flow')).toBe(true);
    expect(unreadCount).toBe(2);
  });

  it('does not notify when an update leaves the active flag unchanged', async () => {
    const id = await createWorkflow('Quiet flow');
    await agent.patch(`/rest/workflows/${id}`).send({ name: 'Quiet flow renamed' });
    expect((await feed()).items).toEqual([]);
  });

  it('marks everything read, then clears', async () => {
    const id = await createWorkflow('Noisy', {
      nodes: [{ id: 'n1', name: 'Webhook', type: 'webhook', typeVersion: 1, position: [0, 0], parameters: { path: 'lib-read', httpMethod: 'GET' } }],
    });
    await agent.patch(`/rest/workflows/${id}`).send({ active: true });

    expect((await agent.post('/rest/notifications/read')).status).toBe(204);
    const afterRead = await feed();
    expect(afterRead.unreadCount).toBe(0);
    expect(afterRead.items[0]?.readAt).not.toBeNull();

    expect((await agent.delete('/rest/notifications')).status).toBe(204);
    expect((await feed()).items).toEqual([]);
  });
});

describe('settings', () => {
  it('reports read-only system info without leaking secrets', async () => {
    const res = await agent.get('/rest/settings/system');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      database: 'sqlite',
      customNodesDir: '/custom/nodes',
      memory: { capture: false, recall: false, tokenBudget: 400 },
    });
    expect(JSON.stringify(res.body)).not.toContain('test-encryption-key');
    expect(JSON.stringify(res.body)).not.toContain('test-jwt-secret');
  });

  it('stores assistant defaults per user and merges partial updates', async () => {
    expect((await agent.get('/rest/settings/preferences')).body).toEqual({});

    const saved = await agent.patch('/rest/settings/preferences').send({ assistant: { tokenLimit: 50_000 } });
    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ assistant: { tokenLimit: 50_000 } });
    expect((await agent.get('/rest/settings/preferences')).body).toEqual({ assistant: { tokenLimit: 50_000 } });
  });

  it('rejects a token limit outside the allowed range', async () => {
    expect((await agent.patch('/rest/settings/preferences').send({ assistant: { tokenLimit: 10 } })).status).toBe(400);
  });

  it('a new assistant session inherits the user default', async () => {
    await agent.patch('/rest/settings/preferences').send({ assistant: { tokenLimit: 12_345 } });
    const workflowId = await createWorkflow('For the assistant');

    const session = await agent.post('/rest/assistant/sessions').send({ workflowId });

    expect((session.body as { tokenBudget: { limit: number } }).tokenBudget.limit).toBe(12_345);
  });
});

describe('changing the password', () => {
  it('changes it, keeps the session alive, and accepts the new password on the next login', async () => {
    const changed = await agent.post('/rest/auth/password').send({ currentPassword: 'correct-horse', newPassword: 'battery-staple' });
    expect(changed.status).toBe(200);

    // Still authenticated afterwards.
    expect((await agent.get('/rest/auth/me')).status).toBe(200);

    const fresh = request.agent(app);
    expect((await fresh.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' })).status).toBe(401);
    expect((await fresh.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'battery-staple' })).status).toBe(200);
  });

  it('refuses a wrong current password, a too-short new one, and an unchanged one', async () => {
    expect((await agent.post('/rest/auth/password').send({ currentPassword: 'wrong', newPassword: 'battery-staple' })).status).toBe(401);
    expect((await agent.post('/rest/auth/password').send({ currentPassword: 'correct-horse', newPassword: 'short' })).status).toBe(400);
    expect((await agent.post('/rest/auth/password').send({ currentPassword: 'correct-horse', newPassword: 'correct-horse' })).status).toBe(400);

    // The original password still works after every rejection.
    const fresh = request.agent(app);
    expect((await fresh.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' })).status).toBe(200);
  });
});
