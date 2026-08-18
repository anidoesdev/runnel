import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiModelProvider } from './openai-model-provider.js';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ModelStreamEvent } from '../model-provider.js';

interface ITestServer {
  url: string;
  lastRequestBody: string;
  close: () => Promise<void>;
}

/** A real local HTTP server crafting hand-written SSE chunks, so the test exercises the actual fetch + ReadableStream parsing path rather than a mocked fetch. Same rationale as packages/core's and packages/nodes-base's own test-server helpers. */
function startSseServer(chunks: string[], options: { status?: number; delayMs?: number } = {}): Promise<ITestServer> {
  let lastRequestBody = '';
  let server!: Server;

  return new Promise((resolve) => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        lastRequestBody = body;

        if (options.status && options.status >= 400) {
          res.writeHead(options.status, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid API key' } }));
          return;
        }

        res.writeHead(200, { 'content-type': 'text/event-stream' });
        void (async () => {
          for (const chunk of chunks) {
            res.write(`data: ${chunk}\n\n`);
            if (options.delayMs) await new Promise((r) => setTimeout(r, options.delayMs));
          }
          res.write('data: [DONE]\n\n');
          res.end();
        })();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        get lastRequestBody() {
          return lastRequestBody;
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

async function collect(iterable: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

let server: ITestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('OpenAiModelProvider', () => {
  it('streams text deltas and a final message_stop / usage event', async () => {
    server = await startSseServer([
      JSON.stringify({ choices: [{ delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { content: ', world' }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3 } }),
    ]);
    const provider = new OpenAiModelProvider({ apiKey: 'test-key', baseUrl: server.url });

    const events = await collect(provider.stream([{ role: 'user', content: 'hi' }], [], 'You are a test.'));

    expect(events).toEqual([
      { type: 'text_delta', text: 'Hello' },
      { type: 'text_delta', text: ', world' },
      { type: 'usage', inputTokens: 12, outputTokens: 3 },
      { type: 'message_stop', stopReason: 'end_turn' },
    ]);
  });

  it('reassembles a tool call streamed across multiple index-keyed chunks', async () => {
    server = await startSseServer([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'add_node', arguments: '' } }] }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"ty' } }] }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'pe":"noOp"}' } }] }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    ]);
    const provider = new OpenAiModelProvider({ apiKey: 'test-key', baseUrl: server.url });

    const events = await collect(provider.stream([{ role: 'user', content: 'add a node' }], [{ name: 'add_node', description: 'add a node', parameters: {} }], 'sys'));

    expect(events).toEqual([
      { type: 'tool_use_start', id: 'call_1', name: 'add_node' },
      { type: 'tool_use_delta', id: 'call_1', argumentsDelta: '{"ty' },
      { type: 'tool_use_delta', id: 'call_1', argumentsDelta: 'pe":"noOp"}' },
      { type: 'tool_use_end', id: 'call_1' },
      { type: 'message_stop', stopReason: 'tool_use' },
    ]);
  });

  it('handles two parallel tool calls interleaved across chunks, keyed by index', async () => {
    server = await startSseServer([
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: 'call_a', function: { name: 'add_node', arguments: '' } },
                { index: 1, id: 'call_b', function: { name: 'connect_nodes', arguments: '' } },
              ],
            },
            finish_reason: null,
          },
        ],
      }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 1, function: { arguments: '{"from":"A"}' } }] }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"type":"noOp"}' } }] }, finish_reason: null }] }),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    ]);
    const provider = new OpenAiModelProvider({ apiKey: 'test-key', baseUrl: server.url });

    const events = await collect(provider.stream([], [], 'sys'));
    const deltasByToolId = new Map<string, string>();
    for (const event of events) {
      if (event.type === 'tool_use_delta') deltasByToolId.set(event.id, (deltasByToolId.get(event.id) ?? '') + event.argumentsDelta);
    }

    expect(deltasByToolId.get('call_a')).toBe('{"type":"noOp"}');
    expect(deltasByToolId.get('call_b')).toBe('{"from":"A"}');
  });

  it('sends the system prompt, streaming flags, and tool definitions in the request body', async () => {
    server = await startSseServer([JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })]);
    const provider = new OpenAiModelProvider({ apiKey: 'test-key', baseUrl: server.url, model: 'gpt-4o-mini' });

    await collect(provider.stream([{ role: 'user', content: 'hi' }], [{ name: 'search_nodes', description: 'find nodes', parameters: { type: 'object' } }], 'You are the Workflow Assistant.'));

    const body = JSON.parse(server.lastRequestBody) as Record<string, unknown>;
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([
      { role: 'system', content: 'You are the Workflow Assistant.' },
      { role: 'user', content: 'hi' },
    ]);
    expect(body.tools).toEqual([{ type: 'function', function: { name: 'search_nodes', description: 'find nodes', parameters: { type: 'object' } } }]);
  });

  it('throws a descriptive error on a non-OK response instead of yielding events', async () => {
    server = await startSseServer([], { status: 401 });
    const provider = new OpenAiModelProvider({ apiKey: 'bad-key', baseUrl: server.url });

    await expect(collect(provider.stream([], [], 'sys'))).rejects.toThrow(/OpenAI request failed \(401\)/);
  });

  it('yields a clean aborted message_stop instead of throwing when the signal fires', async () => {
    server = await startSseServer(
      [JSON.stringify({ choices: [{ delta: { content: 'partial' }, finish_reason: null }] })],
      { delayMs: 200 },
    );
    const provider = new OpenAiModelProvider({ apiKey: 'test-key', baseUrl: server.url });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 20);

    const events = await collect(provider.stream([], [], 'sys', { signal: controller.signal }));
    expect(events.at(-1)).toEqual({ type: 'message_stop', stopReason: 'aborted' });
  });
});
