import { afterEach, describe, expect, it } from 'vitest';
import { httpRequest } from '@n8n-clone/core';
import { languageModelOpenAi } from './LanguageModelOpenAi.node.js';
import { makeNode } from '../../test-utils.js';
import { readRequestBody, startTestServer } from '../../test-server.js';
import type { IDataObject, ISupplyDataFunctions } from '@n8n-clone/workflow';
import type { TestServer } from '../../test-server.js';
import type { IChatModel } from '../shared/ai-types.js';

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function makeSupplyContext(baseUrl: string, parameters: IDataObject = {}): ISupplyDataFunctions {
  const node = makeNode({ name: 'Chat Model', type: 'lmChatOpenAi' });
  return {
    getNodeParameter: (name, _itemIndex, fallback) => parameters[name] ?? fallback,
    getCredentials: async () => ({ apiKey: 'test-api-key', baseUrl }),
    getNode: () => node,
    getWorkflow: () => ({ id: 'wf-1', name: 'test', active: false }),
    helpers: {
      httpRequest,
      httpRequestWithAuthentication: async () => ({}),
      returnJsonArray: (items) => items.map((json) => ({ json })),
      constructExecutionMetaData: (items) => items,
    },
  };
}

async function getModel(baseUrl: string, parameters: IDataObject = {}): Promise<IChatModel> {
  return (await languageModelOpenAi.supplyData!.call(makeSupplyContext(baseUrl, parameters))) as IChatModel;
}

describe('OpenAI Chat Model node', () => {
  it('sends messages to the chat completions endpoint with a Bearer Authorization header and returns the content', async () => {
    let requestBody: IDataObject | undefined;
    let authHeader: string | undefined;

    server = await startTestServer((req, res) => {
      authHeader = req.headers.authorization;
      void readRequestBody(req).then((raw) => {
        requestBody = JSON.parse(raw) as IDataObject;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Hello there!' } }] }));
      });
    });

    const model = await getModel(server.url, { model: 'gpt-4o-mini' });
    const result = await model.chat([{ role: 'user', content: 'Hi' }], []);

    expect(authHeader).toBe('Bearer test-api-key');
    expect(requestBody).toEqual({
      model: 'gpt-4o-mini',
      temperature: 0.7,
      messages: [{ role: 'user', content: 'Hi' }],
    });
    expect(result).toEqual({ content: 'Hello there!', toolCalls: [] });
  });

  it('includes a `tools` block only when tool schemas are passed, in OpenAI function-calling shape', async () => {
    let requestBody: IDataObject | undefined;
    server = await startTestServer((req, res) => {
      void readRequestBody(req).then((raw) => {
        requestBody = JSON.parse(raw) as IDataObject;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }));
      });
    });

    const model = await getModel(server.url);
    await model.chat([{ role: 'user', content: 'Hi' }], [
      { name: 'calculator', description: 'does math', parameters: { type: 'object', properties: {} } },
    ]);

    expect(requestBody!.tools).toEqual([
      { type: 'function', function: { name: 'calculator', description: 'does math', parameters: { type: 'object', properties: {} } } },
    ]);
  });

  it("parses tool_calls out of the model's response", async () => {
    server = await startTestServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"1+1"}' } }],
              },
            },
          ],
        }),
      );
    });

    const model = await getModel(server.url);
    const result = await model.chat([{ role: 'user', content: 'compute' }], []);

    expect(result).toEqual({
      content: null,
      toolCalls: [{ id: 'call_1', name: 'calculator', arguments: '{"expression":"1+1"}' }],
    });
  });

  it('round-trips an assistant tool_calls message and a tool result message in the request body', async () => {
    let requestBody: IDataObject | undefined;
    server = await startTestServer((req, res) => {
      void readRequestBody(req).then((raw) => {
        requestBody = JSON.parse(raw) as IDataObject;
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'done' } }] }));
      });
    });

    const model = await getModel(server.url);
    await model.chat(
      [
        { role: 'user', content: 'compute' },
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'calculator', arguments: '{"expression":"1+1"}' }],
        },
        { role: 'tool', content: '2', toolCallId: 'call_1' },
      ],
      [],
    );

    expect(requestBody!.messages).toEqual([
      { role: 'user', content: 'compute' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'calculator', arguments: '{"expression":"1+1"}' } }],
      },
      { role: 'tool', content: '2', tool_call_id: 'call_1' },
    ]);
  });
});
