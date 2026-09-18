import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_PROMPT } from '@runnel/assistant';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config.js';
import { createDataSource, sqliteConfig } from '../../db/data-source.js';
import { createLogger } from '../../logging/logger.js';
import { createAssistantMemory } from './memory.factory.js';
import { NullMemoryAdapter } from './null-memory.adapter.js';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DataSource } from 'typeorm';
import type { IAssistantMemoryPort, IRecallResult } from '@runnel/assistant';
import type { IMemoryConfig } from '../../config.js';

/**
 * The memory integration seen from the outside — over HTTP, against a real in-memory SQLite
 * database and a local server standing in for OpenAI (same approach as
 * assistant.controller.integration.test.ts). The memory engine itself is replaced by a spy port:
 * these tests are about what the controller does with memory, not about Memnest.
 */

interface IFakeOpenAi {
  url: string;
  /** Every chat-completions request body the assistant sent, in order. */
  requests: Array<{ messages: Array<{ role: string; content: string }> }>;
  close: () => Promise<void>;
}

function startFakeOpenAi(): Promise<IFakeOpenAi> {
  const requests: IFakeOpenAi['requests'] = [];
  let server!: Server;
  return new Promise((resolve) => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        requests.push(JSON.parse(body) as IFakeOpenAi['requests'][number]);
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Noted.' }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ url: `http://127.0.0.1:${port}`, requests, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function spyMemoryPort(overrides: Partial<IAssistantMemoryPort> = {}) {
  const recalled: IRecallResult = {
    memories: [{ id: 'mem_1', content: 'The user wants webhook nodes to verify HMAC signatures.', kind: 'preference' }],
    trace: { query: 'recorded', candidates: [], budget: { limit: 400, used: 12 } },
    tokensUsed: 12,
  };
  return {
    recall: vi.fn(overrides.recall ?? (async () => recalled)),
    capture: vi.fn(overrides.capture ?? (async () => {})),
  };
}

interface IHarness {
  agent: ReturnType<typeof request.agent>;
  sessionId: string;
  openAi: IFakeOpenAi;
  logLines: () => Array<Record<string, unknown>>;
  sendMessage: (message: string) => Promise<{ status: number; events: Array<Record<string, unknown>> }>;
}

let dataSource: DataSource | undefined;
let openAi: IFakeOpenAi | undefined;

afterEach(async () => {
  await openAi?.close();
  openAi = undefined;
  await dataSource?.destroy();
  dataSource = undefined;
});

async function createHarness(port: IAssistantMemoryPort, config: IMemoryConfig): Promise<IHarness> {
  openAi = await startFakeOpenAi();
  dataSource = createDataSource(sqliteConfig(':memory:'));
  await dataSource.initialize();
  await dataSource.runMigrations();

  const logStream = new PassThrough();
  let logText = '';
  logStream.on('data', (chunk: Buffer) => (logText += chunk.toString()));

  const { app } = createApp({
    dataSource,
    encryptionKey: 'test-encryption-key',
    jwtSecret: new TextEncoder().encode('test-jwt-secret-at-least-32-bytes!'),
    logger: createLogger({ level: 'info', destination: logStream }),
    memory: { port, config, close: async () => {} },
  });

  const agent = request.agent(app);
  await agent.post('/rest/auth/setup').send({ email: 'owner@example.com', password: 'correct-horse' });
  await agent.post('/rest/credentials').send({ name: 'Test OpenAI', type: 'openAiApi', data: { apiKey: 'sk-test', baseUrl: openAi.url } });
  const workflow = await agent.post('/rest/workflows').send({ name: 'Memory Test', nodes: [], connections: {} });
  const session = await agent.post('/rest/assistant/sessions').send({ workflowId: (workflow.body as { id: string }).id });
  const sessionId = (session.body as { id: string }).id;

  return {
    agent,
    sessionId,
    openAi,
    logLines: () =>
      logText
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
    sendMessage: async (message) => {
      const res = await agent.post(`/rest/assistant/sessions/${sessionId}/messages`).send({ message });
      const events = String(res.text)
        .split('\n\n')
        .map((block) => block.trim())
        .filter((block) => block.startsWith('data:'))
        .map((block) => JSON.parse(block.slice('data:'.length).trim()) as Record<string, unknown>);
      return { status: res.status, events };
    },
  };
}

function systemPromptOf(openAiRequest: IFakeOpenAi['requests'][number] | undefined): string | undefined {
  return openAiRequest?.messages.find((m) => m.role === 'system')?.content;
}

describe('assistant memory — default off', () => {
  it('with no memory env vars, sends the byte-identical system prompt and never calls the memory port', async () => {
    const config = loadConfig({}).memory;
    expect(config).toEqual({ capture: false, recall: false, tokenBudget: 400, minScore: 1 });

    const port = spyMemoryPort();
    const h = await createHarness(port, config);

    const { status, events } = await h.sendMessage('Always verify HMAC signatures on webhooks.');

    expect(status).toBe(200);
    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    expect(systemPromptOf(h.openAi.requests[0])).toBe(SYSTEM_PROMPT);
    expect(port.recall).not.toHaveBeenCalled();
    expect(port.capture).not.toHaveBeenCalled();
    expect(h.logLines().some((line) => typeof line.event === 'string' && line.event.startsWith('memory.'))).toBe(false);
  });

  it('builds the no-op adapter when both flags are off', async () => {
    const memory = await createAssistantMemory({
      memory: loadConfig({}).memory,
      db: { type: 'sqlite', database: ':memory:' },
      logger: createLogger({ level: 'silent' }),
      credentials: {} as never,
      encryptionKey: 'unused',
    });
    expect(memory.port).toBeInstanceOf(NullMemoryAdapter);
  });
});

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const SHADOW: IMemoryConfig = { capture: true, recall: false, tokenBudget: 400, minScore: 1 };

describe('assistant memory — shadow mode (capture on, recall off)', () => {
  it('recalls and logs, but the system prompt stays byte-identical', async () => {
    const port = spyMemoryPort();
    const h = await createHarness(port, SHADOW);

    const { events } = await h.sendMessage('Build me a webhook.');

    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    expect(systemPromptOf(h.openAi.requests[0])).toBe(SYSTEM_PROMPT);
    expect(port.recall).toHaveBeenCalledWith('Build me a webhook.', expect.objectContaining({ userId: expect.any(String) }), 400);

    const shadow = h.logLines().find((line) => line.event === 'memory.recall.shadow');
    expect(shadow).toMatchObject({
      query: 'Build me a webhook.',
      injected: false,
      memoryCount: 1,
      budgetUsed: 12,
      memories: [expect.objectContaining({ content: 'The user wants webhook nodes to verify HMAC signatures.' })],
    });
    expect(typeof shadow?.durationMs).toBe('number');
  });

  it('redacts the query before logging it', async () => {
    const h = await createHarness(spyMemoryPort(), SHADOW);

    await h.sendMessage('Use my key sk-test-0123456789abcdef-do-not-leak-me for the HTTP node.');

    const shadow = h.logLines().find((line) => line.event === 'memory.recall.shadow');
    expect(shadow?.query).toContain('[redacted]');
    expect(JSON.stringify(h.logLines())).not.toContain('sk-test-0123456789abcdef-do-not-leak-me');
  });

  it('captures the finished session after the turn, including the reply', async () => {
    const port = spyMemoryPort();
    const h = await createHarness(port, SHADOW);

    await h.sendMessage('Always name nodes in snake_case.');

    await waitFor(() => port.capture.mock.calls.length > 0);
    const [captured] = port.capture.mock.calls[0] as unknown as [{ messages: Array<{ role: string; content: string }> }];
    expect(captured.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'Always name nodes in snake_case.' }),
        expect.objectContaining({ role: 'assistant', content: 'Noted.' }),
      ]),
    );
  });
});

describe('assistant memory — failures never break a turn', () => {
  it('recall rejects → the turn completes normally with no memory block, and a warning is logged', async () => {
    const port = spyMemoryPort({
      recall: async () => {
        throw new Error('memory store unavailable');
      },
    });
    const h = await createHarness(port, SHADOW);

    const { status, events } = await h.sendMessage('Build me a webhook.');

    expect(status).toBe(200);
    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    expect(systemPromptOf(h.openAi.requests[0])).toBe(SYSTEM_PROMPT);
    expect(h.logLines().some((line) => line.event === 'memory.recall.failed' && line.level === 40)).toBe(true);
  });

  it.each([
    [
      'rejects',
      async () => {
        throw new Error('extraction queue full');
      },
    ],
    [
      'throws synchronously',
      (() => {
        throw new Error('adapter bug');
      }) as unknown as IAssistantMemoryPort['capture'],
    ],
  ])('capture %s → the response already streamed, nothing thrown, a warning logged', async (_label, capture) => {
    const port = spyMemoryPort({ capture });
    const h = await createHarness(port, SHADOW);

    const { status, events } = await h.sendMessage('Build me a webhook.');

    expect(status).toBe(200);
    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    expect(events.some((event) => event.type === 'error')).toBe(false);
    await waitFor(() => h.logLines().some((line) => line.event === 'memory.capture.failed' && line.level === 40));
  });
});

const LIVE: IMemoryConfig = { capture: true, recall: true, tokenBudget: 400, minScore: 1 };

function recalling(memories: IRecallResult['memories'], tokensUsed = 12): Partial<IAssistantMemoryPort> {
  return { recall: async () => ({ memories, trace: { candidates: [] }, tokensUsed }) };
}

describe('assistant memory — recall on (injection)', () => {
  it('appends the memories that clear the floor to the system prompt, and only those', async () => {
    const port = spyMemoryPort(
      recalling([
        { id: 'strong', content: 'Webhook nodes must verify HMAC signatures.', kind: 'preference', score: 3.4 },
        { id: 'weak', content: 'The user added an HTTP Request node.', kind: 'fact', score: 0.05 },
      ]),
    );
    const h = await createHarness(port, LIVE);

    const { events } = await h.sendMessage('Add a webhook trigger.');

    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    const system = systemPromptOf(h.openAi.requests[0])!;
    expect(system.startsWith(`${SYSTEM_PROMPT}\n\n## What you know about this user`)).toBe(true);
    expect(system).toContain('- Webhook nodes must verify HMAC signatures.');
    expect(system).not.toContain('HTTP Request node');

    const logged = h.logLines().find((line) => line.event === 'memory.recall.injected');
    expect(logged).toMatchObject({ injected: true, memoryCount: 2, injectedCount: 1, belowFloor: 1, passedFloorIds: ['strong'] });
  });

  it('leaves the prompt byte-identical when nothing clears the floor', async () => {
    const port = spyMemoryPort(recalling([{ id: 'weak', content: 'The user said hello.', kind: 'fact', score: 0.2 }]));
    const h = await createHarness(port, LIVE);

    await h.sendMessage('Add a webhook trigger.');

    expect(systemPromptOf(h.openAi.requests[0])).toBe(SYSTEM_PROMPT);
    expect(h.logLines().find((line) => line.event === 'memory.recall.shadow')).toMatchObject({ injected: false, belowFloor: 1 });
  });

  it("charges injected memory to the session's own token budget, and nothing when not injected", async () => {
    const injected = await createHarness(
      spyMemoryPort(recalling([{ id: 'm', content: 'Nodes are named in snake_case.', kind: 'preference', score: 5 }], 37)),
      LIVE,
    );
    await injected.sendMessage('Add a node.');
    const session = (await injected.agent.get(`/rest/assistant/sessions/${injected.sessionId}`)).body as { tokenBudget: { used: number } };
    // The fake model reports no usage of its own, so everything used is the recalled memory.
    expect(session.tokenBudget.used).toBe(37);
  });

  it('a recall failure with injection on still completes the turn with the plain prompt', async () => {
    const port = spyMemoryPort({
      recall: async () => {
        throw new Error('store locked');
      },
    });
    const h = await createHarness(port, LIVE);

    const { events } = await h.sendMessage('Add a node.');

    expect(events.at(-1)).toMatchObject({ type: 'turn_complete' });
    expect(systemPromptOf(h.openAi.requests[0])).toBe(SYSTEM_PROMPT);
  });
});
