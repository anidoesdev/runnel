import {
  NodeOperationError,
  evaluateExpressionString,
  isExpression,
} from '@n8n-clone/workflow';
import type {
  IDataObject,
  IExecuteFunctions,
  IExpressionEvalContext,
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
 * Builds the `this` context passed to `node.execute()`. Credentials and the real HTTP helper
 * are wired up in M5/M6 once there's a credential store and an actual HTTP client to call —
 * here they throw a clear "not yet available" error rather than silently doing nothing.
 */
export function buildExecuteFunctions(options: IExecuteFunctionsOptions): IExecuteFunctions {
  const { node, inputData, runIndex, workflow, runData, mode, executeOnce, contextData } = options;

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
    if (typeof raw === 'string' && isExpression(raw)) {
      return evaluateExpressionString(raw, buildExpressionContext(itemIndex));
    }
    return raw;
  };

  return {
    getInputData,
    getNodeParameter,
    async getCredentials(): Promise<IDataObject> {
      throw new NodeOperationError(node, 'Credential resolution is not available yet', {
        description: 'Credential storage and decryption are wired up in M5/M6.',
      });
    },
    getNode: () => node,
    getWorkflow: () => ({ id: workflow.id, name: workflow.name, active: workflow.active }),
    continueOnFail: () => node.onError === 'continueRegularOutput' || node.onError === 'continueErrorOutput',
    getContext,
    helpers: {
      async httpRequest(): Promise<unknown> {
        throw new NodeOperationError(node, 'The HTTP Request helper is not available yet', {
          description: 'The real HTTP client with retries/proxy support is built in M5.',
        });
      },
      returnJsonArray: (items: IDataObject[]): INodeExecutionData[] => items.map((json) => ({ json })),
      constructExecutionMetaData: (items, options) =>
        items.map((item) => ({ ...item, pairedItem: options.itemData })),
    },
  };
}
