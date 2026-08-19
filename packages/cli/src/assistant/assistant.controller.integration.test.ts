import { createServer } from 'node:http';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { createLogger } from '../logging/logger.js';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import type { Express } from 'express';

/**
 * Proves the whole backend half of Milestone 5, exercised for real over HTTP: create a
 * session, send a message, watch the SSE stream carry the agent's tool calls, confirm the
 * session persisted, review the draft's diff, and apply it to the live workflow — all against a
 * real (in-memory) SQLite database and a local HTTP server standing in for OpenAI (same
 * approach as nodes-base's ai-agent-integration.test.ts), so nothing here depends on network
 * access or a real API key.
 */

function sseChunk(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

interface IFakeOpenAiServer {
  url: string;
  close: () => Promise<void>;
}

/** First call: the model decides to add a NoOp node. Second call: it reports done in plain text. */
function startFakeOpenAiServer(): Promise<IFakeOpenAiServer> {
  let callCount = 0;
  let server!: Server;
  return new Promise((resolve) => {
    server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      callCount++;
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (callCount === 1) {
        res.write(sseChunk({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'add_node', arguments: '' } }] } }] }));
        res.write(sseChunk({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"type":"noOp"}' } }] } }] }));
        res.write(sseChunk({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));
      } else {
        res.write(sseChunk({ choices: [{ delta: { content: 'Added a NoOp node.' }, finish_reason: null }] }));
        res.write(sseChunk({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function parseSseEvents(rawText: string): Array<Record<string, unknown>> {
  return rawText
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice('data:'.length).trim()) as Record<string, unknown>);
}

let dataSource: DataSource;
let app: Express;
let fakeOpenAi: IFakeOpenAiServer | undefined;

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

afterEach(async () => {
  await fakeOpenAi?.close();
  fakeOpenAi = undefined;
});

describe('Assistant REST/SSE API — end to end', () => {
  it('builds a node via a streamed turn, persists the session, diffs the draft, and applies it', async () => {
    fakeOpenAi = await startFakeOpenAiServer();

    const agent = request.agent(app);
    await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });

    await agent.post('/rest/credentials').send({
      name: 'Test OpenAI',
      type: 'openAiApi',
      data: { apiKey: 'sk-test', baseUrl: fakeOpenAi.url },
    });

    const workflowRes = await agent.post('/rest/workflows').send({ name: 'Assistant Test Workflow', nodes: [], connections: {} });
    expect(workflowRes.status).toBe(200);
    const workflowId = (workflowRes.body as { id: string }).id;

    const sessionRes = await agent.post('/rest/assistant/sessions').send({ workflowId });
    expect(sessionRes.status).toBe(200);
    const session = sessionRes.body as { id: string; draftId: string; workflowId: string };
    expect(session.workflowId).toBe(workflowId);

    const messageRes = await agent
      .post(`/rest/assistant/sessions/${session.id}/messages`)
      .send({ message: 'Add a NoOp node.' });

    expect(messageRes.status).toBe(200);
    expect(messageRes.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents(messageRes.text as string);
    expect(events.some((e) => e.type === 'tool_call' && e.name === 'add_node')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result' && e.name === 'add_node')).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'turn_complete', stopReason: 'end_turn' });

    // Nothing touched the live workflow yet — still a draft.
    const stillEmptyWorkflow = await agent.get(`/rest/workflows/${workflowId}`);
    expect((stillEmptyWorkflow.body as { nodes: unknown[] }).nodes).toEqual([]);

    // The session persisted the full transcript.
    const getSessionRes = await agent.get(`/rest/assistant/sessions/${session.id}`);
    expect(getSessionRes.status).toBe(200);
    const persisted = getSessionRes.body as { status: string; messages: Array<{ role: string }> };
    expect(persisted.status).toBe('idle');
    expect(persisted.messages.some((m) => m.role === 'tool')).toBe(true);

    // The diff shows the added node before anything is applied.
    const diffRes = await agent.get(`/rest/assistant/sessions/${session.id}/diff`);
    expect(diffRes.status).toBe(200);
    expect((diffRes.body as { addedNodes: Array<{ type: string }> }).addedNodes).toEqual([{ name: 'No Operation', type: 'noOp' }]);

    // Applying writes it to the real workflow.
    const applyRes = await agent.post(`/rest/assistant/sessions/${session.id}/apply`);
    expect(applyRes.status).toBe(200);
    expect((applyRes.body as { nodes: Array<{ type: string }> }).nodes).toEqual([expect.objectContaining({ type: 'noOp' })]);

    const finalWorkflow = await agent.get(`/rest/workflows/${workflowId}`);
    expect((finalWorkflow.body as { nodes: unknown[] }).nodes).toHaveLength(1);
  });

  it('returns a normal JSON error, not a broken stream, when no openAiApi credential exists', async () => {
    const agent = request.agent(app);
    await agent.post('/rest/auth/login').send({ email: 'owner@example.com', password: 'correct-horse' });

    const workflowRes = await agent.post('/rest/workflows').send({ name: 'No Credential Workflow', nodes: [], connections: {} });
    const workflowId = (workflowRes.body as { id: string }).id;
    const sessionRes = await agent.post('/rest/assistant/sessions').send({ workflowId });
    const sessionId = (sessionRes.body as { id: string }).id;

    // The credential created in the previous test persists in the shared in-memory DB across
    // this file's tests, so remove it here to exercise the "no credential" path specifically.
    const credentialsRes = await agent.get('/rest/credentials');
    for (const credential of credentialsRes.body as Array<{ id: string; type: string }>) {
      if (credential.type === 'openAiApi') await agent.delete(`/rest/credentials/${credential.id}`);
    }

    const res = await agent.post(`/rest/assistant/sessions/${sessionId}/messages`).send({ message: 'hi' });

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).not.toContain('text/event-stream');
  });

  it('rejects unauthenticated requests to the assistant API', async () => {
    const res = await request(app).post('/rest/assistant/sessions').send({ workflowId: 'wf-1' });
    expect(res.status).toBe(401);
  });
});
