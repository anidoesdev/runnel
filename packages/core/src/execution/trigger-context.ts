import { buildExecuteFunctions } from './execute-context.js';
import type { ICredentialTypes } from '../credentials/credential-types.js';
import type {
  IDataObject,
  IHttpRequestOptions,
  INode,
  IPollFunctions,
  ITriggerFunctions,
  IWebhookFunctions,
  IWorkflowBase,
  NodeOutput,
  WorkflowExecuteMode,
} from '@n8n-clone/workflow';

export interface IPollOrTriggerFunctionsOptions {
  node: INode;
  workflow: IWorkflowBase;
  mode: WorkflowExecuteMode;
  credentialsResolver?: (credentialTypeName: string, credentialId?: string) => Promise<IDataObject>;
  credentialTypes?: ICredentialTypes;
  httpClient?: (options: IHttpRequestOptions) => Promise<unknown>;
}

/**
 * `IWorkflowBase.staticData` is a flat bag with two reserved top-level buckets — `node`
 * (keyed by node name) and `global` (shared workflow-wide) — mirroring n8n's real
 * getWorkflowStaticData contract. The returned object is a live reference into
 * `workflow.staticData`, so mutating it (e.g. a poll node recording its last-seen cursor)
 * mutates `workflow` itself; a caller that wants that to survive a restart must persist
 * `workflow.staticData` back to storage after the trigger/poll runs (ActiveWorkflowManager
 * does this after every poll tick and every webhook/trigger emission).
 */
function getWorkflowStaticDataBucket(workflow: IWorkflowBase, type: 'node' | 'global', nodeName: string): IDataObject {
  const staticData = (workflow.staticData ??= {});
  if (type === 'global') {
    return (staticData.global ??= {}) as IDataObject;
  }
  const nodeBuckets = (staticData.node ??= {}) as Record<string, IDataObject>;
  return (nodeBuckets[nodeName] ??= {});
}

/**
 * poll/trigger/webhook nodes have no upstream items to run expressions against, so this
 * reuses buildExecuteFunctions with an empty input set (its expression evaluator already
 * falls back to `{ json: {} }` when there's no item at the requested index) rather than
 * re-implementing getNodeParameter's expression-resolution logic a second time.
 */
function buildSharedFunctions(options: IPollOrTriggerFunctionsOptions) {
  const exec = buildExecuteFunctions({
    node: options.node,
    inputData: [[]],
    runIndex: 0,
    workflow: options.workflow,
    runData: {},
    mode: options.mode,
    contextData: {},
    credentialsResolver: options.credentialsResolver,
    credentialTypes: options.credentialTypes,
    httpClient: options.httpClient,
  });

  return {
    getNodeParameter: exec.getNodeParameter,
    getCredentials: exec.getCredentials,
    getNode: exec.getNode,
    helpers: exec.helpers,
  };
}

export function buildPollFunctions(options: IPollOrTriggerFunctionsOptions): IPollFunctions {
  return {
    ...buildSharedFunctions(options),
    getWorkflowStaticData: (type) => getWorkflowStaticDataBucket(options.workflow, type, options.node.name),
  };
}

export interface ITriggerFunctionsOptions extends IPollOrTriggerFunctionsOptions {
  emit: (data: NodeOutput) => void;
}

export function buildTriggerFunctions(options: ITriggerFunctionsOptions): ITriggerFunctions {
  return {
    ...buildSharedFunctions(options),
    getWorkflowStaticData: (type) => getWorkflowStaticDataBucket(options.workflow, type, options.node.name),
    emit: options.emit,
  };
}

export interface IWebhookFunctionsOptions extends IPollOrTriggerFunctionsOptions {
  request: { method: string; headers: IDataObject; body: unknown; query: IDataObject };
  response: { status(code: number): void; send(body: unknown): void };
}

export function buildWebhookFunctions(options: IWebhookFunctionsOptions): IWebhookFunctions {
  return {
    ...buildSharedFunctions(options),
    getRequestObject: () => options.request,
    getResponseObject: () => options.response,
  };
}
