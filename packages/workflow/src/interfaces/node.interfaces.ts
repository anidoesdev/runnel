import type { IDataObject, INodeExecutionData, NodeOutput } from './common.interfaces.js';

/**
 * `main` is the regular item-flow connection every node has used until now. The `ai_*` types
 * carry no items — they let one node (a chat model, a tool) offer a capability that another
 * node (an agent) resolves and calls directly at execution time, rather than being scheduled
 * through the main queue. See IConnections and IExecuteFunctions.getInputConnectionData.
 */
export type NodeConnectionType = 'main' | 'ai_languageModel' | 'ai_tool';

export type NodePropertyTypes =
  | 'string'
  | 'number'
  | 'boolean'
  | 'options'
  | 'multiOptions'
  | 'collection'
  | 'fixedCollection'
  | 'json'
  | 'dateTime'
  | 'color'
  | 'resourceLocator'
  | 'notice'
  | 'hidden';

export interface INodePropertyOptions {
  name: string;
  value: string | number | boolean;
  description?: string;
  action?: string;
}

export interface IDisplayOptions {
  show?: Record<string, Array<string | number | boolean>>;
  hide?: Record<string, Array<string | number | boolean>>;
}

export interface INodePropertyTypeOptions {
  multipleValues?: boolean;
  rows?: number;
  password?: boolean;
  loadOptionsMethod?: string;
  loadOptionsDependsOn?: string[];
  minValue?: number;
  maxValue?: number;
  sortable?: boolean;
}

export interface INodeProperties {
  displayName: string;
  name: string;
  type: NodePropertyTypes;
  default: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  noDataExpression?: boolean;
  displayOptions?: IDisplayOptions;
  typeOptions?: INodePropertyTypeOptions;
  /** INodePropertyOptions[] for `options`/`multiOptions`; nested INodeProperties[] for `fixedCollection`/`collection`. */
  options?: INodePropertyOptions[] | INodeProperties[];
}

export interface INodeCredentialDescription {
  name: string;
  required?: boolean;
  displayOptions?: IDisplayOptions;
  testedBy?: string;
}

export interface IAuthenticate {
  type: 'generic';
  properties: {
    headers?: Record<string, string>;
    qs?: Record<string, string>;
    body?: IDataObject;
  };
}

export interface ICredentialTestRequest {
  request: { baseURL?: string; url: string; method?: string };
}

export interface ICredentialType {
  name: string;
  displayName: string;
  extends?: string[];
  properties: INodeProperties[];
  authenticate?: IAuthenticate;
  test?: ICredentialTestRequest;
}

export interface INodeTypeDescription {
  displayName: string;
  name: string;
  icon?: string;
  group: string[];
  version: number | number[];
  defaultVersion?: number;
  description: string;
  defaults: { name: string; color?: string };
  inputs: NodeConnectionType[];
  outputs: NodeConnectionType[];
  credentials?: INodeCredentialDescription[];
  properties: INodeProperties[];
  /** Marks node types allowed to form a legal cycle (SplitInBatches, Loop Over Items). */
  iterationNode?: boolean;
  webhooks?: Array<{ name: string; httpMethod: string; responseMode: string; path: string }>;
}

export interface INode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  disabled?: boolean;
  parameters: IDataObject;
  credentials?: Record<string, { id: string; name: string }>;
  onError?: 'stopWorkflow' | 'continueRegularOutput' | 'continueErrorOutput';
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  alwaysOutputData?: boolean;
  executeOnce?: boolean;
  notes?: string;
}

export interface IHttpRequestOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  qs?: IDataObject;
  body?: IDataObject | string;
  json?: boolean;
  timeout?: number;
  /** Defaults to true. When false, a redirect response is returned as-is instead of followed. */
  followRedirect?: boolean;
  maxRedirects?: number;
  /** When true, resolves to { statusCode, headers, body } instead of just the body. */
  returnFullResponse?: boolean;
  /** How to parse the response body. Defaults to 'json' when the response is JSON, else 'text'. */
  encoding?: 'json' | 'text' | 'arraybuffer';
  /** Accepted for forward compatibility; proxy tunneling is not yet wired up (M5 scope note — see http-client.ts). */
  proxy?: string;
  retry?: { maxRetries?: number; retryDelayMs?: number };
}

export interface IHttpResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Narrow execution-context surfaces. The concrete implementations require Node.js I/O
 * (HTTP helper, binary data manager, credential decryption) and live in packages/core —
 * these declarations exist so packages/nodes-base and packages/editor-ui can type against
 * the contract without depending on core.
 */
export interface IExecuteFunctions {
  getInputData(inputIndex?: number): INodeExecutionData[];
  getNodeParameter(name: string, itemIndex: number, fallback?: unknown): unknown;
  getCredentials(name: string): Promise<IDataObject>;
  getNode(): INode;
  getWorkflow(): { id: string; name: string; active: boolean };
  continueOnFail(): boolean;
  /** A persistent object scoped to this node ('node') or the whole run ('flow'), surviving across loop re-entries (runIndex increments). Backed by IRunExecutionData.executionData.contextData. */
  getContext(type: 'node' | 'flow'): IDataObject;
  /**
   * Resolves every node connected to this node's `type` input at `index` (default 0) and
   * calls each one's `supplyData()`, returning their results in connection order. Always an
   * array — a required, single-connection input like `ai_languageModel` still comes back as
   * a 0-or-1-element array; the caller (e.g. the AI Agent node) decides what "missing" means
   * for its own input. `ai_tool` naturally returns 0..N elements, one per connected tool.
   */
  getInputConnectionData(type: NodeConnectionType, index?: number): Promise<unknown[]>;
  helpers: {
    httpRequest(options: IHttpRequestOptions): Promise<unknown>;
    /** Resolves the named credential, applies its declarative `authenticate` block to `options`, and performs the request. */
    httpRequestWithAuthentication(credentialTypeName: string, options: IHttpRequestOptions): Promise<unknown>;
    returnJsonArray(items: IDataObject[]): INodeExecutionData[];
    constructExecutionMetaData(
      items: INodeExecutionData[],
      options: { itemData: INodeExecutionData['pairedItem'] },
    ): INodeExecutionData[];
  };
}

export interface IPollFunctions
  extends Pick<IExecuteFunctions, 'getNodeParameter' | 'getCredentials' | 'getNode' | 'helpers'> {
  getWorkflowStaticData(type: 'node' | 'global'): IDataObject;
}

export interface ITriggerFunctions extends IPollFunctions {
  emit(data: NodeOutput): void;
}

export interface IWebhookFunctions
  extends Pick<IExecuteFunctions, 'getNodeParameter' | 'getCredentials' | 'getNode' | 'helpers'> {
  getRequestObject(): { method: string; headers: IDataObject; body: unknown; query: IDataObject };
  getResponseObject(): { status(code: number): void; send(body: unknown): void };
}

export type ILoadOptionsFunctions = Pick<
  IExecuteFunctions,
  'getNodeParameter' | 'getCredentials' | 'getNode' | 'helpers'
>;

/** Context passed to a sub-node's `supplyData()` — a chat model or tool node has no `main` input, so there's no `getInputData`/item loop here, just its own parameters and credentials. */
export type ISupplyDataFunctions = Pick<
  IExecuteFunctions,
  'getNodeParameter' | 'getCredentials' | 'getNode' | 'getWorkflow' | 'helpers'
>;

export type ICredentialTestFunction = (
  credential: IDataObject,
) => Promise<{ status: 'OK' | 'Error'; message: string }>;

export type ListSearchMethod = (
  this: ILoadOptionsFunctions,
  filter?: string,
) => Promise<{ results: Array<{ name: string; value: string }> }>;

export interface ITriggerResponse {
  closeFunction?: () => Promise<void>;
  manualTriggerFunction?: () => Promise<void>;
}

export interface IWebhookResponseData {
  /** Becomes the initial `startData` handed to WorkflowExecute.run() for the rest of the workflow — same shape as any other node's output, not an array of them. */
  workflowData?: NodeOutput;
  webhookResponse?: unknown;
  noWebhookResponse?: boolean;
}

export interface INodeType {
  description: INodeTypeDescription;
  /**
   * Classifies whether `execute()` is safe to run for real during a grounding dry run (see
   * packages/core's WorkflowExecute `dryRun` option) — 'safe' for a node with no externally
   * observable side effect (a pure transform, or a trigger's execute() pass-through), 'mock' for
   * anything that writes to (or spends money calling) something outside the process. Unset
   * defaults to 'mock': a node must opt in to being trusted, never the reverse, so a future node
   * type that forgets to classify itself is mocked rather than silently run for real.
   */
  dryRunSafety?(parameters: IDataObject): 'safe' | 'mock';
  execute?(this: IExecuteFunctions): Promise<NodeOutput>;
  poll?(this: IPollFunctions): Promise<NodeOutput | null>;
  trigger?(this: ITriggerFunctions): Promise<ITriggerResponse>;
  webhook?(this: IWebhookFunctions): Promise<IWebhookResponseData>;
  /** For a sub-node offering an `ai_*` output (a chat model, a tool) — returns whatever shape that connection type's consumer expects, e.g. `{ chat(...) }` for `ai_languageModel` or `{ name, description, schema, invoke(...) }` for `ai_tool`. Never scheduled through the main queue; called directly by the consuming node via getInputConnectionData. */
  supplyData?(this: ISupplyDataFunctions): Promise<unknown>;
  methods?: {
    loadOptions?: Record<string, (this: ILoadOptionsFunctions) => Promise<INodePropertyOptions[]>>;
    credentialTest?: Record<string, ICredentialTestFunction>;
    listSearch?: Record<string, ListSearchMethod>;
  };
}

export interface VersionedNodeType {
  nodeVersions: Record<number, INodeType>;
  currentVersion: number;
  description: INodeTypeDescription;
}
