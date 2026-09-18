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

const addNodeTool: ITool<
  { type: string; typeVersion?: number; name?: string; parameters?: IDataObject },
  { name: string }
> = {
  name: 'add_node',
  description: 'Add a node of the given type to the workflow draft. Returns the ACTUAL name used after de-duplication — use that, not the requested name, in subsequent connect_nodes calls. Canvas position is placed automatically from the connection graph once you connect_nodes — there is no position to set here.',
  parameters: z.object({
    type: z.string().describe('The node type name, e.g. "httpRequest" — get this from search_nodes, never guess it.'),
    typeVersion: z.number().optional(),
    name: z.string().optional().describe('Requested display name; may be de-duplicated if already taken.'),
    parameters: dataObjectSchema.optional(),
  }),
  handler: (params, ctx) => {
    const { workflow, name } = coreAddNode(currentWorkflow(ctx), ctx.nodeTypes, params);
    ctx.draftStore.mutate(ctx.draftId, () => workflow);
    return { name };
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
