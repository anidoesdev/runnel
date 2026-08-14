import { describe, expect, it } from 'vitest';
import { NodeOperationError } from '@n8n-clone/workflow';
import { buildExecuteFunctions } from './execute-context.js';
import { makeNode, makeWorkflow } from './test-utils.js';
import { MapCredentialTypes } from '../credentials/credential-types.js';
import { MapNodeTypes } from './node-types.js';
import type { IExecuteFunctionsOptions } from './execute-context.js';
import type { ISupplyDataFunctions, INodeType } from '@n8n-clone/workflow';

function baseOptions(overrides: Partial<IExecuteFunctionsOptions> = {}): IExecuteFunctionsOptions {
  const node = overrides.node ?? makeNode({ name: 'Node1', parameters: {} });
  return {
    node,
    inputData: [[{ json: { a: 1 } }, { json: { a: 2 } }]],
    runIndex: 0,
    workflow: makeWorkflow([node], {}),
    runData: {},
    mode: 'manual',
    contextData: {},
    ...overrides,
  };
}

describe('buildExecuteFunctions — getInputData', () => {
  it('returns the items for the requested input branch, defaulting to 0', () => {
    const ctx = buildExecuteFunctions(baseOptions());
    expect(ctx.getInputData()).toEqual([{ json: { a: 1 } }, { json: { a: 2 } }]);
    expect(ctx.getInputData(1)).toEqual([]);
  });

  it('reduces to just the first item when executeOnce is set', () => {
    const ctx = buildExecuteFunctions(baseOptions({ executeOnce: true }));
    expect(ctx.getInputData()).toEqual([{ json: { a: 1 } }]);
  });
});

describe('buildExecuteFunctions — getNodeParameter', () => {
  it('returns the raw value for a non-expression parameter', () => {
    const node = makeNode({ name: 'N', parameters: { mode: 'test' } });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('mode', 0)).toBe('test');
  });

  it('returns the fallback when the parameter is missing', () => {
    const ctx = buildExecuteFunctions(baseOptions());
    expect(ctx.getNodeParameter('missing', 0, 'fallback')).toBe('fallback');
  });

  it('resolves a nested dot-path parameter', () => {
    const node = makeNode({ name: 'N', parameters: { options: { retries: 3 } } });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('options.retries', 0)).toBe(3);
  });

  it('evaluates an expression parameter against the item at the given index', () => {
    const node = makeNode({ name: 'N', parameters: { value: '={{ $json.a * 10 }}' } });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('value', 0)).toBe(10);
    expect(ctx.getNodeParameter('value', 1)).toBe(20);
  });

  it('resolves expressions nested inside an array/object parameter (e.g. a fixedCollection)', () => {
    const node = makeNode({
      name: 'N',
      parameters: {
        fields: {
          values: [
            { name: 'literal', value: 'plain text' },
            { name: 'computed', value: '={{ $json.a + 1 }}' },
          ],
        },
      },
    });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('fields.values', 0)).toEqual([
      { name: 'literal', value: 'plain text' },
      { name: 'computed', value: 2 },
    ]);
  });

  it('exposes $parameter as the node\'s own parameters inside an expression', () => {
    const node = makeNode({ name: 'N', parameters: { mode: 'test', value: '={{ $parameter.mode }}' } });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNodeParameter('value', 0)).toBe('test');
  });

  it('evaluates an expression against an empty item when there is no input data at all', () => {
    const node = makeNode({ name: 'N', parameters: { value: '={{ $json.missing ?? "none" }}' } });
    const ctx = buildExecuteFunctions(baseOptions({ node, inputData: [[]] }));
    expect(ctx.getNodeParameter('value', 0)).toBe('none');
  });
});

describe('buildExecuteFunctions — misc surface', () => {
  it('getNode returns the bound node', () => {
    const node = makeNode({ name: 'N' });
    const ctx = buildExecuteFunctions(baseOptions({ node }));
    expect(ctx.getNode()).toBe(node);
  });

  it('getWorkflow returns id/name/active', () => {
    const node = makeNode({ name: 'N' });
    const workflow = makeWorkflow([node], {});
    const ctx = buildExecuteFunctions(baseOptions({ node, workflow }));
    expect(ctx.getWorkflow()).toEqual({ id: workflow.id, name: workflow.name, active: workflow.active });
  });

  it('continueOnFail reflects the node\'s onError setting', () => {
    const stop = buildExecuteFunctions(baseOptions({ node: makeNode({ name: 'N' }) }));
    expect(stop.continueOnFail()).toBe(false);

    const cont = buildExecuteFunctions(
      baseOptions({ node: makeNode({ name: 'N', onError: 'continueRegularOutput' }) }),
    );
    expect(cont.continueOnFail()).toBe(true);
  });

  it('getCredentials throws when no credentialsResolver was supplied', async () => {
    const ctx = buildExecuteFunctions(baseOptions());
    await expect(ctx.getCredentials('any')).rejects.toThrow(NodeOperationError);
  });

  it('getCredentials delegates to the supplied credentialsResolver', async () => {
    const ctx = buildExecuteFunctions(
      baseOptions({ credentialsResolver: async (name) => ({ resolvedFor: name }) }),
    );
    await expect(ctx.getCredentials('httpBasicAuth')).resolves.toEqual({ resolvedFor: 'httpBasicAuth' });
  });

  it('helpers.httpRequest delegates to the injected httpClient', async () => {
    const calls: unknown[] = [];
    const ctx = buildExecuteFunctions(
      baseOptions({
        httpClient: async (opts) => {
          calls.push(opts);
          return { ok: true };
        },
      }),
    );
    const result = await ctx.helpers.httpRequest({ url: 'http://example.com' });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'http://example.com' }]);
  });

  it('helpers.httpRequestWithAuthentication throws when no credentialTypes registry was supplied', async () => {
    const ctx = buildExecuteFunctions(
      baseOptions({ credentialsResolver: async () => ({}), httpClient: async () => ({}) }),
    );
    await expect(ctx.helpers.httpRequestWithAuthentication('httpBasicAuth', { url: 'http://x' })).rejects.toThrow(
      NodeOperationError,
    );
  });

  it('helpers.httpRequestWithAuthentication resolves credentials, applies auth, then requests', async () => {
    const credentialTypes = new MapCredentialTypes().register({
      name: 'apiKeyAuth',
      displayName: 'API Key',
      properties: [],
      authenticate: { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } } },
    });
    const calls: unknown[] = [];
    const ctx = buildExecuteFunctions(
      baseOptions({
        credentialTypes,
        credentialsResolver: async () => ({ apiKey: 'sk-123' }),
        httpClient: async (opts) => {
          calls.push(opts);
          return { ok: true };
        },
      }),
    );

    const result = await ctx.helpers.httpRequestWithAuthentication('apiKeyAuth', { url: 'http://x' });
    expect(result).toEqual({ ok: true });
    expect(calls).toEqual([{ url: 'http://x', headers: { Authorization: 'Bearer sk-123' }, qs: {} }]);
  });

  it('helpers.returnJsonArray wraps plain objects as items', () => {
    const ctx = buildExecuteFunctions(baseOptions());
    expect(ctx.helpers.returnJsonArray([{ a: 1 }, { a: 2 }])).toEqual([{ json: { a: 1 } }, { json: { a: 2 } }]);
  });

  it('helpers.constructExecutionMetaData attaches pairedItem to each item', () => {
    const ctx = buildExecuteFunctions(baseOptions());
    const result = ctx.helpers.constructExecutionMetaData([{ json: { a: 1 } }], { itemData: { item: 0 } });
    expect(result).toEqual([{ json: { a: 1 }, pairedItem: { item: 0 } }]);
  });
});

describe('buildExecuteFunctions — getContext', () => {
  it('returns a stable object across repeated calls for the same node', () => {
    const contextData: Record<string, unknown> = {};
    const node = makeNode({ name: 'N' });
    const ctx = buildExecuteFunctions(baseOptions({ node, contextData }));
    const first = ctx.getContext('node');
    first.counter = 1;
    expect(ctx.getContext('node')).toBe(first);
    expect(ctx.getContext('node').counter).toBe(1);
  });

  it('scopes "node" context separately per node name', () => {
    const contextData: Record<string, unknown> = {};
    const nodeA = makeNode({ name: 'A' });
    const nodeB = makeNode({ name: 'B' });
    buildExecuteFunctions(baseOptions({ node: nodeA, contextData })).getContext('node').value = 'a';
    buildExecuteFunctions(baseOptions({ node: nodeB, contextData })).getContext('node').value = 'b';
    expect(buildExecuteFunctions(baseOptions({ node: nodeA, contextData })).getContext('node')).toEqual({
      value: 'a',
    });
  });

  it('shares "flow" context across different nodes', () => {
    const contextData: Record<string, unknown> = {};
    const nodeA = makeNode({ name: 'A' });
    const nodeB = makeNode({ name: 'B' });
    buildExecuteFunctions(baseOptions({ node: nodeA, contextData })).getContext('flow').shared = 'x';
    expect(buildExecuteFunctions(baseOptions({ node: nodeB, contextData })).getContext('flow')).toEqual({
      shared: 'x',
    });
  });
});

describe('buildExecuteFunctions — getInputConnectionData', () => {
  const fakeChatModel: INodeType = {
    description: {
      displayName: 'Fake Chat Model',
      name: 'fakeChatModel',
      group: ['ai'],
      version: 1,
      description: 'test',
      defaults: { name: 'Fake Chat Model' },
      inputs: [],
      outputs: ['ai_languageModel'],
      properties: [],
    },
    async supplyData(this: ISupplyDataFunctions) {
      return { modelName: this.getNodeParameter('model', 0, 'default-model') };
    },
  };

  const fakeTool: INodeType = {
    description: {
      displayName: 'Fake Tool',
      name: 'fakeTool',
      group: ['ai'],
      version: 1,
      description: 'test',
      defaults: { name: 'Fake Tool' },
      inputs: [],
      outputs: ['ai_tool'],
      properties: [],
    },
    async supplyData(this: ISupplyDataFunctions) {
      return { name: this.getNode().name };
    },
  };

  it('returns [] without a nodeTypes registry', async () => {
    const ctx = buildExecuteFunctions(baseOptions());
    expect(await ctx.getInputConnectionData('ai_languageModel')).toEqual([]);
  });

  it('returns [] when nothing is connected at that type', async () => {
    const nodeTypes = new MapNodeTypes().register(fakeChatModel);
    const ctx = buildExecuteFunctions(baseOptions({ nodeTypes }));
    expect(await ctx.getInputConnectionData('ai_languageModel')).toEqual([]);
  });

  it("calls the connected sub-node's supplyData() and returns its result", async () => {
    const agent = makeNode({ name: 'Agent' });
    const chatModel = makeNode({ name: 'Chat Model', type: 'fakeChatModel', parameters: { model: 'gpt-4o-mini' } });
    const workflow = makeWorkflow([agent, chatModel], {
      'Chat Model': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
    });
    const nodeTypes = new MapNodeTypes().register(fakeChatModel);

    const ctx = buildExecuteFunctions(baseOptions({ node: agent, workflow, nodeTypes }));
    expect(await ctx.getInputConnectionData('ai_languageModel')).toEqual([{ modelName: 'gpt-4o-mini' }]);
  });

  it('resolves multiple sub-nodes connected at the same type (e.g. several tools)', async () => {
    const agent = makeNode({ name: 'Agent' });
    const calculator = makeNode({ name: 'Calculator', type: 'fakeTool' });
    const weather = makeNode({ name: 'Weather', type: 'fakeTool' });
    const workflow = makeWorkflow([agent, calculator, weather], {
      Calculator: { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
      Weather: { ai_tool: [[{ node: 'Agent', type: 'ai_tool', index: 0 }]] },
    });
    const nodeTypes = new MapNodeTypes().register(fakeTool);

    const ctx = buildExecuteFunctions(baseOptions({ node: agent, workflow, nodeTypes }));
    expect(await ctx.getInputConnectionData('ai_tool')).toEqual([{ name: 'Calculator' }, { name: 'Weather' }]);
  });

  it("throws when the connected node's type has no supplyData()", async () => {
    const agent = makeNode({ name: 'Agent' });
    const notASubNode = makeNode({ name: 'Not A Sub-Node', type: 'test.noOp' });
    const workflow = makeWorkflow([agent, notASubNode], {
      'Not A Sub-Node': { ai_languageModel: [[{ node: 'Agent', type: 'ai_languageModel', index: 0 }]] },
    });
    const nodeTypes = new MapNodeTypes().register({
      description: { ...fakeChatModel.description, name: 'test.noOp' },
    });

    const ctx = buildExecuteFunctions(baseOptions({ node: agent, workflow, nodeTypes }));
    await expect(ctx.getInputConnectionData('ai_languageModel')).rejects.toThrow(NodeOperationError);
  });
});
