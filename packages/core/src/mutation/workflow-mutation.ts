import { Workflow, WorkflowOperationError } from '@n8n-clone/workflow';
import type { IConnection, IDataObject, INode, INodeTypeDescription, IWorkflowBase, NodeConnectionType } from '@n8n-clone/workflow';
import type { INodeTypes } from '../execution/node-types.js';

/**
 * Server-side counterparts of the graph edits the editor's Pinia store (workflow.store.ts)
 * already does client-side — but validated against the live node registry and returning a new
 * IWorkflowBase rather than mutating in place, so they're safe to call from anywhere that only
 * has a workflow document and a registry (the assistant's tool layer, scripts, MCP). Invalid
 * input (an unknown node type, a connection type neither end declares) throws
 * WorkflowOperationError instead of silently producing a broken document.
 */

/**
 * Subclasses of WorkflowOperationError, one per failure mode a caller might need to react to
 * differently (the assistant's tool layer, in particular, maps each of these to a distinct
 * error code for the model rather than pattern-matching message text). Existing `instanceof
 * WorkflowOperationError` checks and message-based assertions elsewhere keep working unchanged.
 */
export class NodeNotFoundError extends WorkflowOperationError {
  constructor(name: string) {
    super(`Node "${name}" not found.`);
    this.name = 'NodeNotFoundError';
  }
}

export class UnknownNodeTypeError extends WorkflowOperationError {
  constructor(type: string, typeVersion: number | undefined, cause: unknown) {
    super(`Unknown node type "${type}"${typeVersion ? ` version ${typeVersion}` : ''}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'UnknownNodeTypeError';
  }
}

export class IncompatibleConnectionError extends WorkflowOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'IncompatibleConnectionError';
  }
}

export class UnknownCredentialTypeError extends WorkflowOperationError {
  constructor(message: string) {
    super(message);
    this.name = 'UnknownCredentialTypeError';
  }
}

function uniqueNodeName(nodes: INode[], base: string): string {
  const existing = new Set(nodes.map((n) => n.name));
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

function requireNode(workflow: IWorkflowBase, name: string): INode {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new NodeNotFoundError(name);
  return node;
}

function describeType(nodeTypes: INodeTypes, type: string, typeVersion?: number): INodeTypeDescription {
  try {
    return nodeTypes.getByNameAndVersion(type, typeVersion).description;
  } catch (err) {
    throw new UnknownNodeTypeError(type, typeVersion, err);
  }
}

function resolveVersion(description: INodeTypeDescription, requested?: number): number {
  if (requested !== undefined) return requested;
  if (description.defaultVersion !== undefined) return description.defaultVersion;
  return Array.isArray(description.version) ? Math.max(...description.version) : description.version;
}

export interface IAddNodeParams {
  type: string;
  typeVersion?: number;
  name?: string;
  position?: [number, number];
  parameters?: IDataObject;
}

export interface IAddNodeResult {
  workflow: IWorkflowBase;
  name: string;
}

/** The node type must already be registered — an unknown type is rejected here, before it ever reaches a saved document. Returns the *actual* name used after de-duplication. */
export function addNode(workflow: IWorkflowBase, nodeTypes: INodeTypes, params: IAddNodeParams): IAddNodeResult {
  const description = describeType(nodeTypes, params.type, params.typeVersion);

  const cloned = structuredClone(workflow);
  const name = uniqueNodeName(cloned.nodes, params.name ?? description.defaults.name);
  const node: INode = {
    id: crypto.randomUUID(),
    name,
    type: params.type,
    typeVersion: resolveVersion(description, params.typeVersion),
    position: params.position ?? [0, 0],
    parameters: params.parameters ?? {},
  };
  cloned.nodes.push(node);

  return { workflow: cloned, name };
}

export interface IConnectNodesParams {
  from: string;
  to: string;
  outputIndex?: number;
  inputIndex?: number;
  type?: NodeConnectionType;
}

/** Rejects a connection whose type isn't declared on both ends (e.g. wiring `ai_tool` into a `main` input) — a mismatched edge is structurally impossible, not merely discouraged. Idempotent: connecting the same pair twice is a no-op. */
export function connectNodes(workflow: IWorkflowBase, nodeTypes: INodeTypes, params: IConnectNodesParams): IWorkflowBase {
  const type = params.type ?? 'main';
  const outputIndex = params.outputIndex ?? 0;
  const inputIndex = params.inputIndex ?? 0;

  const sourceNode = requireNode(workflow, params.from);
  const targetNode = requireNode(workflow, params.to);
  const sourceDescription = describeType(nodeTypes, sourceNode.type, sourceNode.typeVersion);
  const targetDescription = describeType(nodeTypes, targetNode.type, targetNode.typeVersion);

  if (!sourceDescription.outputs.includes(type)) {
    throw new IncompatibleConnectionError(`"${params.from}" (${sourceNode.type}) has no "${type}" output.`);
  }
  if (!targetDescription.inputs.includes(type)) {
    throw new IncompatibleConnectionError(`"${params.to}" (${targetNode.type}) has no "${type}" input.`);
  }

  const cloned = structuredClone(workflow);
  const entry = (cloned.connections[params.from] ??= {});
  const branches = (entry[type] ??= []);
  while (branches.length <= outputIndex) branches.push([]);
  const branch = branches[outputIndex]!;
  if (!branch.some((c) => c.node === params.to && c.index === inputIndex)) {
    branch.push({ node: params.to, type, index: inputIndex });
  }

  return cloned;
}

export interface IDisconnectNodesParams {
  from: string;
  to: string;
  outputIndex?: number;
  inputIndex?: number;
  type?: NodeConnectionType;
}

/** No-op (not an error) when the two nodes weren't connected — mirrors the editor's own removeConnection. */
export function disconnectNodes(workflow: IWorkflowBase, params: IDisconnectNodesParams): IWorkflowBase {
  const type = params.type ?? 'main';
  const outputIndex = params.outputIndex ?? 0;
  const inputIndex = params.inputIndex ?? 0;
  requireNode(workflow, params.from);
  requireNode(workflow, params.to);

  const cloned = structuredClone(workflow);
  const branch = cloned.connections[params.from]?.[type]?.[outputIndex];
  if (!branch) return cloned;
  cloned.connections[params.from]![type]![outputIndex] = branch.filter(
    (c) => !(c.node === params.to && c.index === inputIndex),
  );

  return cloned;
}

function isPlainObject(value: unknown): value is IDataObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepMerge(base: IDataObject, patch: IDataObject): IDataObject {
  const result: IDataObject = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const existing = result[key];
    result[key] = isPlainObject(value) && isPlainObject(existing) ? deepMerge(existing, value) : value;
  }
  return result;
}

export interface ISetNodeParametersParams {
  name: string;
  parameters: IDataObject;
}

/** Deep-merges into the node's existing parameters — an agent narrowing one field doesn't clobber sibling fields it never mentioned. */
export function setNodeParameters(workflow: IWorkflowBase, params: ISetNodeParametersParams): IWorkflowBase {
  const node = requireNode(workflow, params.name);
  const cloned = structuredClone(workflow);
  const target = cloned.nodes.find((n) => n.name === params.name)!;
  target.parameters = deepMerge(node.parameters, params.parameters);
  return cloned;
}

/** Renames a node, and everything that references it (connections, pinData, `$node[...]`/`$(...)` expressions in every other node) — delegates entirely to Workflow.renameNode, the one mutation that already existed at the domain layer. */
export function renameNode(workflow: IWorkflowBase, params: { oldName: string; newName: string }): IWorkflowBase {
  return new Workflow(workflow).renameNode(params.oldName, params.newName).toJSON();
}

/** Removes the node and every connection referencing it, either as source or target, main or sub-node. */
export function removeNode(workflow: IWorkflowBase, params: { name: string }): IWorkflowBase {
  requireNode(workflow, params.name);
  const cloned = structuredClone(workflow);
  cloned.nodes = cloned.nodes.filter((n) => n.name !== params.name);
  delete cloned.connections[params.name];
  for (const entry of Object.values(cloned.connections)) {
    for (const type of Object.keys(entry) as NodeConnectionType[]) {
      entry[type] = entry[type]!.map((branch) => branch.filter((c) => c.node !== params.name));
    }
  }
  if (cloned.pinData && params.name in cloned.pinData) {
    cloned.pinData = { ...cloned.pinData };
    delete cloned.pinData[params.name];
  }
  return cloned;
}

export interface ISetNodeCredentialParams {
  name: string;
  credentialType: string;
  credentialId: string | null;
  credentialName?: string;
}

/** Validates that the node type actually declares `credentialType` — attaching a credential a node doesn't use is a structural mistake the agent shouldn't be able to make silently. `credentialId: null` clears it. */
export function setNodeCredential(workflow: IWorkflowBase, nodeTypes: INodeTypes, params: ISetNodeCredentialParams): IWorkflowBase {
  const node = requireNode(workflow, params.name);
  const description = describeType(nodeTypes, node.type, node.typeVersion);
  if (!description.credentials?.some((c) => c.name === params.credentialType)) {
    throw new UnknownCredentialTypeError(`Node "${params.name}" (${node.type}) does not use a "${params.credentialType}" credential.`);
  }

  const cloned = structuredClone(workflow);
  const target = cloned.nodes.find((n) => n.name === params.name)!;
  const next = { ...target.credentials };
  if (params.credentialId) {
    next[params.credentialType] = { id: params.credentialId, name: params.credentialName ?? params.credentialId };
  } else {
    delete next[params.credentialType];
  }
  target.credentials = next;
  return cloned;
}

export interface IWorkflowOutlineNode {
  name: string;
  type: string;
  disabled: boolean;
  unsetRequiredParams: string[];
}

export interface IWorkflowOutlineConnection {
  from: string;
  outputIndex: number;
  to: string;
  inputIndex: number;
  type: NodeConnectionType;
}

export interface IWorkflowOutline {
  nodes: IWorkflowOutlineNode[];
  connections: IWorkflowOutlineConnection[];
}

/**
 * The compact, agent-facing view of a workflow — full node parameter values and expression
 * bodies are deliberately left out (a workflow document can exceed 200KB; see get_node_schema's
 * budget for why that matters for context). Node types that fail to resolve against the
 * registry report an empty `unsetRequiredParams` here rather than throwing — that failure mode
 * belongs to validate_workflow's diagnostics, a later milestone, not to this read path.
 */
export function getWorkflowOutline(workflow: IWorkflowBase, nodeTypes: INodeTypes): IWorkflowOutline {
  const nodes: IWorkflowOutlineNode[] = workflow.nodes.map((node) => {
    let unsetRequiredParams: string[] = [];
    try {
      const description = nodeTypes.getByNameAndVersion(node.type, node.typeVersion).description;
      unsetRequiredParams = description.properties
        .filter((property) => property.required && isUnset(node.parameters[property.name]))
        .map((property) => property.name);
    } catch {
      unsetRequiredParams = [];
    }
    return { name: node.name, type: node.type, disabled: node.disabled ?? false, unsetRequiredParams };
  });

  const connections: IWorkflowOutlineConnection[] = [];
  for (const [from, entry] of Object.entries(workflow.connections)) {
    for (const [type, branches] of Object.entries(entry) as Array<[NodeConnectionType, IConnection[][]]>) {
      branches.forEach((branch, outputIndex) => {
        for (const c of branch) connections.push({ from, outputIndex, to: c.node, inputIndex: c.index, type });
      });
    }
  }

  return { nodes, connections };
}

function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}
