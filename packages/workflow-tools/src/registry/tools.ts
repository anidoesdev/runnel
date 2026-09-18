import { z } from 'zod';
import {
  addNode as coreAddNode,
  connectNodes as coreConnectNodes,
  disconnectNodes as coreDisconnectNodes,
  getWorkflowOutline as coreGetWorkflowOutline,
  removeNode as coreRemoveNode,
  renameNode as coreRenameNode,
  setNodeCredential as coreSetNodeCredential,
  setNodeParameters as coreSetNodeParameters,
} from '@runnel/core';
import { dataObjectSchema } from '../json-schema.js';
import { compressNodeSchema } from '../catalog/schema-compression.js';
import { createCatalogTools } from './catalog-tools.js';
import { createCredentialTools } from './credential-tools.js';
import { createExecutionTools } from './execution-tools.js';
import type { AnyTool, IToolContext, ITool } from './tool.js';
import type { IWorkflowOutline } from '@runnel/core';
import type { IDataObject } from '@runnel/workflow';

const connectionTypeSchema = z.enum(['main', 'ai_languageModel', 'ai_tool']);

/** Reads the draft's current working copy — every mutation tool follows this same read-mutate-write pattern against ctx.draftStore, which is what keeps each handler five lines. */
function currentWorkflow(ctx: IToolContext) {
  return ctx.draftStore.get(ctx.draftId).current;
}

/** Longest parameter description echoed back by add_node — enough to tell two modes apart, not a manual. */
const PARAMETER_DESCRIPTION_CHARS = 100;

export interface IAddNodeResult {
  name: string;
  /** What was actually added — worth checking against what you meant (a Webhook trigger that receives requests is not an HTTP Request node that sends them). */
  added: { type: string; displayName: string; description: string };
  /** Every parameter this node takes given what's set so far: exact names, and allowed values where there's a fixed list. Set them with set_node_parameters. */
  parameters: Array<{
    name: string;
    type: string;
    required: boolean;
    default: unknown;
    options?: Array<string | number | boolean>;
    description?: string;
  }>;
  /** Required parameters still empty on this node. */
  unsetRequired: string[];
  /** Credential types this node takes — the exact values for list_credentials/request_credential/set_node_credential. */
  credentialTypes: string[];
}

/**
 * The result carries the node's own parameter list, not just its name. In live evals the model
 * routinely skipped get_node_schema, guessed `method` for a Webhook's `httpMethod`, and never set
 * the parameter at all — handing it the exact names and allowed values at the moment it has just
 * added the node closes that gap without an extra round trip, and echoing the node's display name
 * and description lets it notice when it picked the wrong type.
 */
function describeAddedNode(ctx: IToolContext, name: string): IAddNodeResult {
  const node = currentWorkflow(ctx).nodes.find((candidate) => candidate.name === name)!;
  const description = ctx.nodeTypes.getByNameAndVersion(node.type, node.typeVersion).description;
  const schema = compressNodeSchema(description, node.parameters);
  const parameters = schema.properties.map((property) => ({
    name: property.name,
    type: property.type,
    required: property.required,
    default: property.default,
    ...(property.options ? { options: property.options.map((option) => option.value) } : {}),
    ...(property.description ? { description: property.description.slice(0, PARAMETER_DESCRIPTION_CHARS) } : {}),
  }));
  const unsetRequired = schema.properties
    .filter((property) => property.required)
    .filter((property) => {
      const value = node.parameters[property.name];
      return value === undefined || value === null || value === '';
    })
    .map((property) => property.name);
  return {
    name,
    added: { type: node.type, displayName: description.displayName, description: description.description },
    parameters,
    unsetRequired,
    credentialTypes: schema.credentials,
  };
}

const addNodeTool: ITool<{ type: string; typeVersion?: number; name?: string; parameters?: IDataObject }, IAddNodeResult> = {
  name: 'add_node',
  description:
    'Add a node of the given type to the workflow draft. Returns the ACTUAL name used after de-duplication — use that, not the requested name, in subsequent connect_nodes calls — plus what was added and its parameters (exact names, allowed values, which required ones are still unset): check it is the node you meant, then set what the user asked for with set_node_parameters. Canvas position is placed automatically from the connection graph once you connect_nodes — there is no position to set here.',
  parameters: z.object({
    type: z.string().describe('The node type name, e.g. "httpRequest" — get this from search_nodes, never guess it.'),
    typeVersion: z.number().optional(),
    name: z.string().optional().describe('Requested display name; may be de-duplicated if already taken.'),
    parameters: dataObjectSchema.optional(),
  }),
  handler: (params, ctx) => {
    const { workflow, name } = coreAddNode(currentWorkflow(ctx), ctx.nodeTypes, params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return describeAddedNode(ctx, name);
  },
};

const connectNodesTool: ITool<
  { from: string; to: string; outputIndex?: number; inputIndex?: number; type?: 'main' | 'ai_languageModel' | 'ai_tool' },
  { connected: true }
> = {
  name: 'connect_nodes',
  description: 'Wire one node\'s output to another node\'s input. `type` defaults to "main"; use "ai_languageModel"/"ai_tool" for AI Agent sub-node connections. Idempotent.',
  parameters: z.object({
    from: z.string(),
    to: z.string(),
    outputIndex: z.number().int().nonnegative().optional(),
    inputIndex: z.number().int().nonnegative().optional(),
    type: connectionTypeSchema.optional(),
  }),
  handler: (params, ctx) => {
    const workflow = coreConnectNodes(currentWorkflow(ctx), ctx.nodeTypes, params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { connected: true };
  },
};

const disconnectNodesTool: ITool<
  { from: string; to: string; outputIndex?: number; inputIndex?: number; type?: 'main' | 'ai_languageModel' | 'ai_tool' },
  { disconnected: true }
> = {
  name: 'disconnect_nodes',
  description: 'Remove a connection between two nodes. A no-op if they were not connected.',
  parameters: z.object({
    from: z.string(),
    to: z.string(),
    outputIndex: z.number().int().nonnegative().optional(),
    inputIndex: z.number().int().nonnegative().optional(),
    type: connectionTypeSchema.optional(),
  }),
  handler: (params, ctx) => {
    const workflow = coreDisconnectNodes(currentWorkflow(ctx), params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { disconnected: true };
  },
};

const setNodeParametersTool: ITool<{ name: string; parameters: IDataObject }, { updated: true }> = {
  name: 'set_node_parameters',
  description: 'Deep-merge new values into a node\'s parameters. Untouched fields are preserved — only pass the fields you want to change.',
  parameters: z.object({ name: z.string(), parameters: dataObjectSchema }),
  handler: (params, ctx) => {
    const workflow = coreSetNodeParameters(currentWorkflow(ctx), params, ctx.nodeTypes);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { updated: true };
  },
};

const renameNodeTool: ITool<{ oldName: string; newName: string }, { renamed: true }> = {
  name: 'rename_node',
  description: 'Rename a node. Connections and every expression referencing it elsewhere in the workflow are rewritten automatically.',
  parameters: z.object({ oldName: z.string(), newName: z.string() }),
  requiresApproval: true,
  handler: (params, ctx) => {
    const workflow = coreRenameNode(currentWorkflow(ctx), params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { renamed: true };
  },
};

const removeNodeTool: ITool<{ name: string }, { removed: true }> = {
  name: 'remove_node',
  description: 'Remove a node and every connection referencing it.',
  parameters: z.object({ name: z.string() }),
  requiresApproval: true,
  handler: (params, ctx) => {
    const workflow = coreRemoveNode(currentWorkflow(ctx), params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { removed: true };
  },
};

const setNodeCredentialTool: ITool<
  { name: string; credentialType: string; credentialId: string | null; credentialName?: string },
  { updated: true }
> = {
  name: 'set_node_credential',
  description: 'Attach a stored credential to a node, or clear one (credentialId: null). The credential must already exist — use list_credentials to find its id; never invent one.',
  parameters: z.object({
    name: z.string(),
    credentialType: z.string(),
    credentialId: z.string().nullable(),
    credentialName: z.string().optional(),
  }),
  handler: (params, ctx) => {
    const workflow = coreSetNodeCredential(currentWorkflow(ctx), ctx.nodeTypes, params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { updated: true };
  },
};

const getWorkflowOutlineTool: ITool<Record<string, never>, IWorkflowOutline> = {
  name: 'get_workflow_outline',
  description: 'Compact view of the current draft: every node\'s name, type, and unset required parameters, plus every connection. Use this instead of reading the full workflow document.',
  parameters: z.object({}),
  handler: (_params, ctx) => coreGetWorkflowOutline(currentWorkflow(ctx), ctx.nodeTypes),
};

/** The read/mutate tool set that operates on a draft's graph directly (Milestone 1). Node-catalog discovery (search_nodes, get_node_schema, get_node_options — Milestone 2) lives in catalog-tools.ts; validate_workflow, execute_until, ask_user, and the credential-listing tools remain deliberately absent — adding stubs for them here would violate "never stub and continue". */
export function createWorkflowTools(): AnyTool[] {
  return [
    getWorkflowOutlineTool,
    addNodeTool,
    connectNodesTool,
    disconnectNodesTool,
    setNodeParametersTool,
    renameNodeTool,
    removeNodeTool,
    setNodeCredentialTool,
  ] as AnyTool[];
}

function createAllTools(): AnyTool[] {
  return [...createWorkflowTools(), ...createCatalogTools(), ...createCredentialTools(), ...createExecutionTools()];
}

export function createToolRegistry(tools: AnyTool[] = createAllTools()): Map<string, AnyTool> {
  const registry = new Map<string, AnyTool>();
  for (const tool of tools) registry.set(tool.name, tool);
  return registry;
}
