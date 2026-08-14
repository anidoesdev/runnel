import request from 'supertest';
import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createDataSource, sqliteConfig } from './db/data-source.js';
import { createLogger } from './logging/logger.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import type { Express } from 'express';
import type { INodeType } from '@n8n-clone/workflow';

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
  ({ app } = createApp({
    dataSource,
    encryptionKey: 'test-encryption-key',
    jwtSecret: new TextEncoder().encode('test-jwt-secret-at-least-32-bytes!'),
    logger: createLogger({ level: 'silent' }),
  }));
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

  it('sets helmet security headers and an access-log request id on every response', async () => {
    const res = await request(app).get('/healthz/');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-request-id']).toEqual(expect.any(String));
  });

  it('reports setup status, completes owner setup, and rejects a second attempt', async () => {
    const before = await request(app).get('/rest/auth/setup');
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ completed: false });

    const agent = request.agent(app);
    const setup = await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });
    expect(setup.status).toBe(200);
    expect(setup.body).toEqual({ id: expect.any(String), email: 'owner@example.com' });

    const me = await agent.get('/rest/auth/me');
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ email: 'owner@example.com', isOwner: true });

    const after = await request(app).get('/rest/auth/setup');
    expect(after.body).toEqual({ completed: true });

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

  it('runs only up to a given destinationNode, leaving anything downstream of it un-run (the NDV "run to here" button)', async () => {
    const res = await agent
      .post(`/rest/workflows/${workflowId}/execute`)
      .send({ data: [{ name: 'Ada' }], destinationNode: 'Set' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');
    expect(res.body.data.resultData.runData.Trigger).toHaveLength(1);
    expect(res.body.data.resultData.runData.Set).toHaveLength(1);
    expect(res.body.data.resultData.runData.Done).toBeUndefined();
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

/**
 * Proves the ai_languageModel/ai_tool sub-node connection types are accepted end to end over
 * the real REST API — the one layer the nodes-base package's own AI Agent integration test
 * (which drives WorkflowExecute directly) never touches: the zod connections schema in
 * workflow.dto.ts, and the credential lookup path from a real stored+encrypted credential.
 */
describe('REST API — AI Agent workflow (ai_languageModel / ai_tool sub-node connections)', () => {
  let agent: ReturnType<typeof request.agent>;
  let fakeOpenAiServer: Server;
  let fakeOpenAiUrl: string;
  let callCount: number;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });

    callCount = 0;
    fakeOpenAiServer = createServer((_req, res) => {
      callCount++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'The answer is 42.' } }] }));
    });
    await new Promise<void>((resolve) => fakeOpenAiServer.listen(0, '127.0.0.1', resolve));
    const { port } = fakeOpenAiServer.address() as AddressInfo;
    fakeOpenAiUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fakeOpenAiServer.close(() => resolve()));
  });

  it('creates, saves, and executes a workflow wiring an AI Agent to a Chat Model and a Tool sub-node', async () => {
    const credentialRes = await agent.post('/rest/credentials').send({
      name: 'My OpenAI account',
      type: 'openAiApi',
      data: { apiKey: 'test-api-key', baseUrl: fakeOpenAiUrl },
    });
    expect(credentialRes.status).toBe(200);
    const credentialId = credentialRes.body.id as string;

    const workflowRes = await agent.post('/rest/workflows').send({
      name: 'AI Agent workflow',
      nodes: [
        { id: '1', name: 'Trigger', type: 'manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
        {
          id: '2',
          name: 'Agent',
          type: 'aiAgent',
          typeVersion: 1,
          position: [1, 0],
          parameters: { prompt: 'What is 6 times 7?' },
        },
        {
          id: '3',
          name: 'Chat Model',
          type: 'lmChatOpenAi',
          typeVersion: 1,
          position: [1, 1],
          parameters: {},
          credentials: { openAiApi: { id: credentialId, name: 'My OpenAI account' } },
        },
        { id: '4', name: 'Calculator', type: 'toolCalculator', typeVersion: 1, position: [1, 2], parameters: {} },
      ],
      connections: {
        Trigger: { main: [[{ node: 'Agent', type: 'main', index: 0 }]] },
        'Chat Model': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
        Calculator: { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
      },
    });

    expect(workflowRes.status).toBe(200);
    const workflowId = workflowRes.body.id as string;

    const executeRes = await agent.post(`/rest/workflows/${workflowId}/execute`).send({ data: [{}] });

    expect(executeRes.status).toBe(200);
    expect(executeRes.body.status).toBe('success');
    expect(callCount).toBe(1);

    const agentRuns = executeRes.body.data.resultData.runData.Agent as Array<{ data: { main: Array<Array<{ json: { output: string } }>> } }>;
    expect(agentRuns[0]!.data.main[0]![0]!.json.output).toBe('The answer is 42.');
  });
});

describe('REST API — activating a workflow starts its webhook (M7)', () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
  });

  function webhookWorkflowPayload(path: string, active: boolean) {
    return {
      name: 'Webhook workflow',
      active,
      nodes: [
        { id: '1', name: 'Webhook', type: 'webhook', typeVersion: 1, position: [0, 0], parameters: { httpMethod: 'POST', path, responseMode: 'lastNode' } },
        {
          id: '2',
          name: 'Set',
          type: 'set',
          typeVersion: 1,
          position: [1, 0],
          parameters: { fields: { values: [{ name: 'greeting', type: 'string', value: '={{ "hi " + $json.body.name }}' }] } },
        },
      ],
      connections: { Webhook: { main: [[{ node: 'Set', type: 'main', index: 0 }]] } },
    };
  }

  it('an unauthenticated request to an inactive workflow\'s webhook path 404s', async () => {
    const created = await agent.post('/rest/workflows').send(webhookWorkflowPayload('inactive-hook', false));
    expect(created.body.active).toBe(false);

    const res = await request(app).post('/webhook/inactive-hook').send({ name: 'Ada' });
    expect(res.status).toBe(404);
  });

  it('creating an active workflow registers its webhook, reachable without a session', async () => {
    const created = await agent.post('/rest/workflows').send(webhookWorkflowPayload('greet', true));
    expect(created.status).toBe(200);
    expect(created.body.active).toBe(true);
    const workflowId = created.body.id as string;

    const webhookRes = await request(app).post('/webhook/greet').send({ name: 'Ada' });
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body).toEqual([{ json: { headers: expect.any(Object), params: {}, query: {}, body: { name: 'Ada' }, greeting: 'hi Ada' }, pairedItem: { item: 0 } }]);

    const executions = await agent.get('/rest/executions').query({ workflowId });
    expect(executions.body).toHaveLength(1);
    expect(executions.body[0].mode).toBe('webhook');
  });

  it('deactivating a workflow un-registers its webhook', async () => {
    const created = await agent.post('/rest/workflows').send(webhookWorkflowPayload('to-deactivate', true));
    const workflowId = created.body.id as string;
    expect((await request(app).post('/webhook/to-deactivate').send({ name: 'x' })).status).toBe(200);

    const deactivated = await agent.patch(`/rest/workflows/${workflowId}`).send({ active: false });
    expect(deactivated.body.active).toBe(false);

    const res = await request(app).post('/webhook/to-deactivate').send({ name: 'x' });
    expect(res.status).toBe(404);
  });

  it('rejects activating a workflow whose webhook path collides with another active workflow, and never persists it', async () => {
    const first = await agent.post('/rest/workflows').send(webhookWorkflowPayload('shared', true));
    expect(first.body.active).toBe(true);

    const beforeCount = (await agent.get('/rest/workflows')).body.length as number;

    const second = await agent.post('/rest/workflows').send(webhookWorkflowPayload('shared', true));
    expect(second.status).toBe(400);

    const afterCount = (await agent.get('/rest/workflows')).body.length as number;
    expect(afterCount).toBe(beforeCount);

    // The webhook still routes to the first (successfully activated) workflow.
    expect((await request(app).post('/webhook/shared').send({ name: 'x' })).status).toBe(200);
  });
});

describe('REST API — node/credential type metadata for the editor (M8)', () => {
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });
  });

  it('lists every built-in node type description', async () => {
    const res = await agent.get('/rest/node-types');
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((n) => n.name);
    expect(names).toEqual(
      expect.arrayContaining(['manualTrigger', 'scheduleTrigger', 'webhook', 'set', 'if', 'httpRequest']),
    );
  });

  it('lists every built-in credential type', async () => {
    const res = await agent.get('/rest/credential-types');
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['httpBasicAuth', 'httpHeaderAuth']));
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/rest/node-types')).status).toBe(401);
    expect((await request(app).get('/rest/credential-types')).status).toBe(401);
  });
});

describe('REST API — custom node types (M10)', () => {
  const echoCustomNode: INodeType = {
    description: {
      displayName: 'Echo Custom',
      name: 'echoCustom',
      group: ['transform'],
      version: 1,
      description: 'A fake custom node for testing CUSTOM_NODES_DIR loading',
      defaults: { name: 'Echo Custom' },
      inputs: [],
      outputs: ['main'],
      properties: [],
    },
    async execute() {
      return [[{ json: { fromCustomNode: true } }]];
    },
  };

  const collidingSetNode: INodeType = {
    description: {
      displayName: 'Not The Real Set',
      name: 'set',
      group: ['transform'],
      version: 1,
      description: 'Pretends to be the built-in Set node',
      defaults: { name: 'Not The Real Set' },
      inputs: ['main'],
      outputs: ['main'],
      properties: [],
    },
    async execute() {
      return [[{ json: { imposter: true } }]];
    },
  };

  let customDataSource: DataSource;
  let customApp: Express;
  let agent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    customDataSource = createDataSource(sqliteConfig(':memory:'));
    await customDataSource.initialize();
    await customDataSource.runMigrations();
    ({ app: customApp } = createApp({
      dataSource: customDataSource,
      encryptionKey: 'test-encryption-key',
      jwtSecret: new TextEncoder().encode('test-jwt-secret-at-least-32-bytes!'),
      logger: createLogger({ level: 'silent' }),
      customNodeTypes: [echoCustomNode, collidingSetNode],
    }));

    agent = request.agent(customApp);
    await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });
  });

  afterAll(async () => {
    await customDataSource.destroy();
  });

  it('lists the custom node alongside the built-ins', async () => {
    const res = await agent.get('/rest/node-types');
    const names = (res.body as Array<{ name: string }>).map((n) => n.name);
    expect(names).toContain('echoCustom');
  });

  it('a workflow using the custom node runs successfully', async () => {
    const created = await agent.post('/rest/workflows').send({
      name: 'Custom node workflow',
      nodes: [{ id: '1', name: 'Echo', type: 'echoCustom', typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {},
    });
    expect(created.status).toBe(200);

    const run = await agent.post(`/rest/workflows/${created.body.id}/execute`).send({});
    expect(run.status).toBe(200);
    expect(run.body.status).toBe('success');
    expect(run.body.data.resultData.runData.Echo[0].data.main[0]).toEqual([{ json: { fromCustomNode: true } }]);
  });

  it('a custom node colliding with a built-in name is skipped — the built-in still wins', async () => {
    const res = await agent.get('/rest/node-types');
    const setEntries = (res.body as Array<{ name: string; displayName: string }>).filter((n) => n.name === 'set');
    expect(setEntries).toHaveLength(1);
    expect(setEntries[0]!.displayName).toBe('Edit Fields (Set)');
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
