import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDataSource, sqliteConfig } from './db/data-source.js';
import { createLogger } from './logging/logger.js';
import type { DataSource } from 'typeorm';
import type { Express } from 'express';

/**
 * The M6 definition of done, exercised for real: a workflow is created, run, and inspected
 * entirely over the REST API — against a real (in-memory) SQLite database that's been
 * migrated the same way `n8n-clone start` would migrate it, not a mocked repository layer.
 */
let dataSource: DataSource;
let app: Express;

beforeAll(async () => {
  dataSource = createDataSource(sqliteConfig(':memory:'));
  await dataSource.initialize();
  await dataSource.runMigrations();
  app = createApp({
    dataSource,
    encryptionKey: 'test-encryption-key',
    jwtSecret: new TextEncoder().encode('test-jwt-secret-at-least-32-bytes!'),
    logger: createLogger({ level: 'silent' }),
  });
});

afterAll(async () => {
  await dataSource.destroy();
});

describe('REST API — auth', () => {
  it('rejects protected routes with no session', async () => {
    const res = await request(app).get('/rest/workflows');
    expect(res.status).toBe(401);
  });

  it('healthz is public and reports readiness once the DB is initialized', async () => {
    const live = await request(app).get('/healthz/');
    expect(live.status).toBe(200);
    const ready = await request(app).get('/healthz/readiness');
    expect(ready.status).toBe(200);
  });

  it('completes owner setup and rejects a second attempt', async () => {
    const agent = request.agent(app);
    const setup = await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });
    expect(setup.status).toBe(200);
    expect(setup.body).toEqual({ id: expect.any(String), email: 'owner@example.com' });

    const me = await agent.get('/rest/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'owner@example.com', isOwner: true });

    const secondSetup = await request(app)
      .post('/rest/auth/setup')
      .send({ email: 'someone-else@example.com', password: 'whatever12' });
    expect(secondSetup.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    const wrongPassword = await request(app)
      .post('/rest/auth/login')
      .send({ email: 'owner@example.com', password: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);

    const agent = request.agent(app);
    const login = await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
    expect(login.status).toBe(200);
    const me = await agent.get('/rest/auth/me');
    expect(me.status).toBe(200);
  });
});

describe('REST API — a workflow created, run, and inspected entirely over the API', () => {
  // `agent` must be created inside beforeAll, not at describe-body scope: describe bodies run
  // at collection time, before any beforeAll — `app` (assigned by the top-level beforeAll)
  // would still be undefined here otherwise.
  let agent: ReturnType<typeof request.agent>;
  let workflowId: string;
  let executionId: string;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
  });

  it('creates a workflow', async () => {
    const res = await agent.post('/rest/workflows').send({
      name: 'Greeting workflow',
      nodes: [
        { id: '1', name: 'Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
        {
          id: '2',
          name: 'Set',
          type: 'set',
          typeVersion: 1,
          position: [1, 0],
          parameters: { fields: { values: [{ name: 'greeting', type: 'string', value: '={{ "hi " + $json.name }}' }] } },
        },
        { id: '3', name: 'Done', type: 'noOp', typeVersion: 1, position: [2, 0], parameters: {} },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Set', type: 'main', index: 0 }]] },
        Set: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.name).toBe('Greeting workflow');
    workflowId = res.body.id as string;
  });

  it('lists the created workflow', async () => {
    const res = await agent.get('/rest/workflows');
    expect(res.status).toBe(200);
    expect(res.body.map((w: { id: string }) => w.id)).toContain(workflowId);
  });

  it('fetches the workflow by id', async () => {
    const res = await agent.get(`/rest/workflows/${workflowId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Greeting workflow');
  });

  it('returns 404 for an unknown workflow id', async () => {
    const res = await agent.get('/rest/workflows/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('runs the workflow via the execute endpoint', async () => {
    const res = await agent
      .post(`/rest/workflows/${workflowId}/execute`)
      .send({ data: [{ name: 'Ada' }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    executionId = res.body.executionId as string;
    expect(executionId).toEqual(expect.any(String));

    const doneRuns = res.body.data.resultData.runData.Done as Array<{ data: { main: unknown[][] } }>;
    expect(doneRuns[0]!.data.main[0]).toEqual([{ json: { name: 'Ada', greeting: 'hi Ada' }, pairedItem: { item: 0 } }]);
  });

  it('inspects the resulting execution by id', async () => {
    const res = await agent.get(`/rest/executions/${executionId}`);
    expect(res.status).toBe(200);
    expect(res.body.workflowId).toBe(workflowId);
    expect(res.body.status).toBe('success');
    expect(res.body.data.resultData.runData.Set).toHaveLength(1);
  });

  it('lists executions filtered by workflowId', async () => {
    const res = await agent.get('/rest/executions').query({ workflowId });
    expect(res.status).toBe(200);
    expect(res.body.map((e: { id: string }) => e.id)).toContain(executionId);
  });

  it('updates the workflow', async () => {
    const res = await agent.patch(`/rest/workflows/${workflowId}`).send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
  });

  it('deletes the workflow', async () => {
    const del = await agent.delete(`/rest/workflows/${workflowId}`);
    expect(del.status).toBe(204);
    const get = await agent.get(`/rest/workflows/${workflowId}`);
    expect(get.status).toBe(404);
  });
});

describe('REST API — credentials never expose their values', () => {
  let agent: ReturnType<typeof request.agent>;
  let credentialId: string;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
  });

  it('creates a credential and never returns its data field', async () => {
    const res = await agent.post('/rest/credentials').send({
      name: 'My Basic Auth',
      type: 'httpBasicAuth',
      data: { user: 'alice', password: 'do-not-leak-me-3921' },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'My Basic Auth',
      type: 'httpBasicAuth',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toContain('do-not-leak-me-3921');
    credentialId = res.body.id as string;
  });

  it('never returns the data field when listing or fetching one', async () => {
    const list = await agent.get('/rest/credentials');
    expect(JSON.stringify(list.body)).not.toContain('do-not-leak-me-3921');

    const one = await agent.get(`/rest/credentials/${credentialId}`);
    expect(one.status).toBe(200);
    expect(JSON.stringify(one.body)).not.toContain('do-not-leak-me-3921');
    expect(one.body).not.toHaveProperty('data');
  });

  it('deletes the credential', async () => {
    const res = await agent.delete(`/rest/credentials/${credentialId}`);
    expect(res.status).toBe(204);
    expect((await agent.get(`/rest/credentials/${credentialId}`)).status).toBe(404);
  });
});

describe('REST API — logout invalidates the session', () => {
  it('rejects protected routes after logout', async () => {
    const agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
    expect((await agent.get('/rest/workflows')).status).toBe(200);

    await agent.post('/rest/auth/logout');
    expect((await agent.get('/rest/workflows')).status).toBe(401);
  });
});
