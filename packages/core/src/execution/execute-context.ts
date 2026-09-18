import {
  NodeOperationError,
  Workflow,
  evaluateExpressionString,
  isExpression,
} from '@runnel/workflow';
import { applyCredentialAuthentication } from '../credentials/authenticate.js';
import { httpRequest as defaultHttpRequest } from '../http/http-client.js';
import type { ICredentialTypes } from '../credentials/credential-types.js';
import type { INodeTypes } from './node-types.js';
import type {
  IDataObject,
  IExecuteFunctions,
  IExpressionEvalContext,
  IHttpRequestOptions,
  INode,
  INodeExecutionData,
  ISupplyDataFunctions,
  ITaskData,
  IWorkflowBase,
  NodeConnectionType,
  NodeOutput,
  WorkflowExecuteMode,
} from '@runnel/workflow';

export interface IExecuteFunctionsOptions {
  node: INode;
  inputData: NodeOutput;
  runIndex: number;
  workflow: IWorkflowBase;
  runData: Record<string, ITaskData[]>;
  mode: WorkflowExecuteMode;
  /** When true, the node runs once total against only the first input item, not once per item. */
  executeOnce?: boolean;
  /** Backing store for getContext() — IRunExecutionData.executionData.contextData, shared across all nodes in the run. */
  contextData: Record<string, unknown>;
  /**
   * Resolves a credential to its decrypted values. `credentialId` is the id the node actually
   * has assigned for that type (`node.credentials[credentialTypeName].id`), threaded through by
   * `getCredentials` below — a resolver should prefer it over "any credential of this type" once
   * more than one of the same type can exist (see run-workflow.ts's implementation). It's
   * undefined for a node that never called set_node_credential, in which case falling back to
   * type-only lookup is the best a resolver can do.
   */
  credentialsResolver?: (credentialTypeName: string, credentialId?: string) => Promise<IDataObject>;
  /** Needed alongside credentialsResolver to look up a credential type's declarative `authenticate` block. */
  credentialTypes?: ICredentialTypes;
  /** Overridable for tests; defaults to the real fetch-based client. */
  httpClient?: (options: IHttpRequestOptions) => Promise<unknown>;
  /** Needed only for getInputConnectionData — resolves the node type of a connected sub-node (a chat model, a tool) so its supplyData() can be called. Omitted in most existing tests, which don't exercise ai_* connections; getInputConnectionData simply returns [] without it. */
  nodeTypes?: INodeTypes;
}

function getByPath(source: IDataObject, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === 'object' && key in (acc as object)) {
      return (acc as IDataObject)[key];
    }
    return undefined;
  }, source);
}

/**
 * getNodeParameter resolves expressions anywhere inside the requested parameter's value, not
 * just when the top-level value itself is a "=..." string — a fixedCollection parameter like
 * Set's `fields.values` is an array of `{ name, type, value }` objects, and `value` is exactly
 * where a per-item expression actually lives. Recursing here means every node's parameters
 * get this for free instead of each one having to call an expression evaluator itself.
 */
function deepResolveExpressions(value: unknown, evaluate: (expr: string) => unknown): unknown {
  if (typeof value === 'string') {
    return isExpression(value) ? evaluate(value) : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => deepResolveExpressions(entry, evaluate));
  }
  if (value !== null && typeof value === 'object') {
    const result: IDataObject = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = deepResolveExpressions(entry, evaluate) as IDataObject[string];
    }
    return result;
  }
  return value;
}

/**
 * Builds the `this` context passed to a sub-node's `supplyData()` — a chat model or tool node
 * has no `main` input, so there's no per-item loop here: expressions in its own parameters
 * resolve against a single synthetic empty item, matching how a node with nothing upstream of
 * it would otherwise behave.
 */
function buildSupplyDataFunctions(options: {
  node: INode;
  workflow: IWorkflowBase;
  runData: Record<string, ITaskData[]>;
  mode: WorkflowExecuteMode;
  credentialsResolver?: (credentialTypeName: string, credentialId?: string) => Promise<IDataObject>;
  credentialTypes?: ICredentialTypes;
  httpClient?: (options: IHttpRequestOptions) => Promise<unknown>;
}): ISupplyDataFunctions {
  const { node, workflow, runData, mode, credentialsResolver, credentialTypes, httpClient } = options;
  const performRequest = httpClient ?? defaultHttpRequest;

  const expressionContext: IExpressionEvalContext = {
    item: { json: {} },
    itemIndex: 0,
    runIndex: 0,
    node,
    workflow,
    runData,
    mode,
    inputItems: [],
    parameters: node.parameters,
  };

  const getNodeParameter = (name: string, _itemIndex: number, fallback?: unknown): unknown => {
    const raw = getByPath(node.parameters, name);
    if (raw === undefined) return fallback;
    return deepResolveExpressions(raw, (expr) => evaluateExpressionString(expr, expressionContext));
  };

  const getCredentials = async (name: string): Promise<IDataObject> => {
    if (!credentialsResolver) {
      throw new NodeOperationError(node, `Credential "${name}" is not available`, {
        description: 'No credentialsResolver was supplied to the execution context.',
      });
    }
    return credentialsResolver(name, node.credentials?.[name]?.id);
  };

  return {
    getNodeParameter,
    getCredentials,
    getNode: () => node,
    getWorkflow: () => ({ id: workflow.id, name: workflow.name, active: workflow.active }),
    helpers: {
      httpRequest: (requestOptions: IHttpRequestOptions) => performRequest(requestOptions),
      async httpRequestWithAuthentication(credentialTypeName, requestOptions) {
        if (!credentialTypes) {
          throw new NodeOperationError(node, `Credential type "${credentialTypeName}" is not available`, {
            description: 'No credentialTypes registry was supplied to the execution context.',
          });
        }
        const credentials = await getCredentials(credentialTypeName);
        const credentialType = credentialTypes.getByName(credentialTypeName);
        const authenticated = applyCredentialAuthentication(requestOptions, credentialType, credentials);
        return performRequest(authenticated);
      },
      returnJsonArray: (items: IDataObject[]): INodeExecutionData[] => items.map((json) => ({ json })),
      constructExecutionMetaData: (items, metaOptions) =>
        items.map((item) => ({ ...item, pairedItem: metaOptions.itemData })),
    },
  };
}

/** Builds the `this` context passed to `node.execute()`. */
export function buildExecuteFunctions(options: IExecuteFunctionsOptions): IExecuteFunctions {
  const {
    node,
    inputData,
    runIndex,
    workflow,
    runData,
    mode,
    executeOnce,
    contextData,
    credentialsResolver,
    credentialTypes,
    httpClient,
    nodeTypes,
  } = options;

  const performRequest = httpClient ?? defaultHttpRequest;

  const getContext = (type: 'node' | 'flow'): IDataObject => {
    const key = type === 'node' ? `node:${node.name}` : 'flow';
    return (contextData[key] ??= {}) as IDataObject;
  };

  const getInputData = (inputIndex = 0): INodeExecutionData[] => {
    const items = inputData[inputIndex] ?? [];
    return executeOnce ? items.slice(0, 1) : items;
  };

  const buildExpressionContext = (itemIndex: number): IExpressionEvalContext => {
    const inputItems = getInputData(0);
    return {
      item: inputItems[itemIndex] ?? inputItems[0] ?? { json: {} },
      itemIndex,
      runIndex,
      node,
      workflow,
      runData,
      mode,
      inputItems,
      parameters: node.parameters,
    };
  };

  const getNodeParameter = (name: string, itemIndex: number, fallback?: unknown): unknown => {
    const raw = getByPath(node.parameters, name);
    if (raw === undefined) return fallback;
    const expressionContext = buildExpressionContext(itemIndex);
    return deepResolveExpressions(raw, (expr) => evaluateExpressionString(expr, expressionContext));
  };

  const getCredentials = async (name: string): Promise<IDataObject> => {
    if (!credentialsResolver) {
      throw new NodeOperationError(node, `Credential "${name}" is not available`, {
        description: 'No credentialsResolver was supplied to the execution context (wired up for real in M6).',
      });
    }
    return credentialsResolver(name, node.credentials?.[name]?.id);
  };

  return {
    getInputData,
    getNodeParameter,
    getCredentials,
    getNode: () => node,
    getWorkflow: () => ({ id: workflow.id, name: workflow.name, active: workflow.active }),
    continueOnFail: () => node.onError === 'continueRegularOutput' || node.onError === 'continueErrorOutput',
    getContext,
    async getInputConnectionData(type: NodeConnectionType, index = 0): Promise<unknown[]> {
      if (!nodeTypes) return [];

      const sourceNames = new Workflow(workflow).getConnectedSubNodes(node.name, type, index);
      const results: unknown[] = [];

      for (const sourceName of sourceNames) {
        const subNode = workflow.nodes.find((candidate) => candidate.name === sourceName);
        if (!subNode) continue;

        const subNodeType = nodeTypes.getByNameAndVersion(subNode.type, subNode.typeVersion);
        if (!subNodeType.supplyData) {
          throw new NodeOperationError(node, `Node "${sourceName}" is connected as a "${type}" input but doesn't supply one.`);
        }

        const subContext = buildSupplyDataFunctions({
          node: subNode,
          workflow,
          runData,
          mode,
          credentialsResolver,
          credentialTypes,
          httpClient,
        });
        results.push(await subNodeType.supplyData.call(subContext));
      }

      return results;
    },
    helpers: {
      httpRequest: (requestOptions: IHttpRequestOptions) => performRequest(requestOptions),
      async httpRequestWithAuthentication(credentialTypeName, requestOptions) {
        if (!credentialTypes) {
          throw new NodeOperationError(node, `Credential type "${credentialTypeName}" is not available`, {
            description: 'No credentialTypes registry was supplied to the execution context.',
          });
        }
        const credentials = await getCredentials(credentialTypeName);
        const credentialType = credentialTypes.getByName(credentialTypeName);
        const authenticated = applyCredentialAuthentication(requestOptions, credentialType, credentials);
        return performRequest(authenticated);
      },
      returnJsonArray: (items: IDataObject[]): INodeExecutionData[] => items.map((json) => ({ json })),
      constructExecutionMetaData: (items, metaOptions) =>
        items.map((item) => ({ ...item, pairedItem: metaOptions.itemData })),
    },
  };
}
