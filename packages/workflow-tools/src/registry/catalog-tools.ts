import { z } from 'zod';
import { UnknownNodeTypeError } from '@runnel/core';
import { searchNodeTypes } from '../catalog/search-nodes.js';
import { compressNodeSchema, getFieldOptions } from '../catalog/schema-compression.js';
import { dataObjectSchema } from '../json-schema.js';
import type { AnyTool, IToolContext, ITool } from './tool.js';
import type { INodeSearchResult } from '../catalog/search-nodes.js';
import type { ICompressedNodeSchema, INodeOptionEntry } from '../catalog/schema-compression.js';
import type { IDataObject, INodeTypeDescription } from '@runnel/workflow';

/** Same "wrap the raw registry error" pattern as packages/core's mutation module — MapNodeTypes throws a plain Error, not one of core's typed subclasses, so it's translated here at the one seam that calls it directly. */
function describeType(ctx: IToolContext, type: string, typeVersion?: number): INodeTypeDescription {
  try {
    return ctx.nodeTypes.getByNameAndVersion(type, typeVersion).description;
  } catch (err) {
    throw new UnknownNodeTypeError(type, typeVersion, err);
  }
}

const searchNodesTool: ITool<{ query: string; limit?: number }, INodeSearchResult[]> = {
  name: 'search_nodes',
  description: 'Find node types by capability, brand name, or outcome — e.g. "send a slack message", "db", "notify my team". Always search before calling add_node; never guess a type string.',
  parameters: z.object({ query: z.string().min(1), limit: z.number().int().positive().max(50).optional() }),
  handler: (params, ctx) => searchNodeTypes(ctx.nodeTypes.list(), params.query, params.limit),
};

const getNodeSchemaTool: ITool<{ type: string; typeVersion?: number; currentParameters?: IDataObject }, ICompressedNodeSchema> = {
  name: 'get_node_schema',
  description: 'The compact parameter schema for one node type: required fields, defaults, and a usage example. Call this before setting any parameter on a node type you have not already configured in this session.',
  parameters: z.object({ type: z.string(), typeVersion: z.number().optional(), currentParameters: dataObjectSchema.optional() }),
  handler: (params, ctx) => compressNodeSchema(describeType(ctx, params.type, params.typeVersion), params.currentParameters),
};

const getNodeOptionsTool: ITool<{ type: string; typeVersion?: number; field: string }, INodeOptionEntry[]> = {
  name: 'get_node_options',
  description: 'The full option list for a field get_node_schema reported as truncated (more than 30 choices).',
  parameters: z.object({ type: z.string(), typeVersion: z.number().optional(), field: z.string() }),
  handler: (params, ctx) => getFieldOptions(describeType(ctx, params.type, params.typeVersion), params.field),
};

export function createCatalogTools(): AnyTool[] {
  return [searchNodesTool, getNodeSchemaTool, getNodeOptionsTool] as AnyTool[];
}
