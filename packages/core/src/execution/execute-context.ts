import {
  NodeOperationError,
  evaluateExpressionString,
  isExpression,
} from '@n8n-clone/workflow';
import { applyCredentialAuthentication } from '../credentials/authenticate.js';
import { httpRequest as defaultHttpRequest } from '../http/http-client.js';
import type { ICredentialTypes } from '../credentials/credential-types.js';
import type {
  IDataObject,
  IExecuteFunctions,
  IExpressionEvalContext,
  IHttpRequestOptions,
  INode,
  INodeExecutionData,
  ITaskData,
  IWorkflowBase,
  NodeOutput,
  WorkflowExecuteMode,
} from '@n8n-clone/workflow';

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
  /** Resolves a credential *type* name (e.g. "httpBasicAuth") to that credential's decrypted values. Real storage/decryption is wired up in M6 — tests and callers supply this directly for now. */
  credentialsResolver?: (credentialTypeName: string) => Promise<IDataObject>;
  /** Needed alongside credentialsResolver to look up a credential type's declarative `authenticate` block. */
  credentialTypes?: ICredentialTypes;
  /** Overridable for tests; defaults to the real fetch-based client. */
  httpClient?: (options: IHttpRequestOptions) => Promise<unknown>;
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
    return credentialsResolver(name);
  };

  return {
    getInputData,
    getNodeParameter,
    getCredentials,
    getNode: () => node,
    getWorkflow: () => ({ id: workflow.id, name: workflow.name, active: workflow.active }),
    continueOnFail: () => node.onError === 'continueRegularOutput' || node.onError === 'continueErrorOutput',
    getContext,
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
