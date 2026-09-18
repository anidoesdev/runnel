import { z } from 'zod';
import type { IDataObject, IDataObjectValue } from '@runnel/workflow';

/**
 * Mirrors IDataObjectValue's recursive shape exactly (rather than `z.record(z.unknown())`,
 * whose inferred output type is `Record<string, unknown>` — not assignable to IDataObject,
 * since `unknown` doesn't structurally narrow to `IDataObjectValue`). This gets real
 * validation *and* a TS type that lines up with the domain type, no unsafe casts needed.
 */
const jsonValueSchema: z.ZodType<IDataObjectValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.undefined(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const dataObjectSchema = z.record(z.string(), jsonValueSchema) as z.ZodType<IDataObject>;

const nodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    typeVersion: z.number(),
    position: z.tuple([z.number(), z.number()]),
    disabled: z.boolean().optional(),
    parameters: dataObjectSchema,
    credentials: z.record(z.string(), z.object({ id: z.string(), name: z.string() })).optional(),
    onError: z.enum(['stopWorkflow', 'continueRegularOutput', 'continueErrorOutput']).optional(),
    retryOnFail: z.boolean().optional(),
    maxTries: z.number().optional(),
    waitBetweenTries: z.number().optional(),
    alwaysOutputData: z.boolean().optional(),
    executeOnce: z.boolean().optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const connectionTypeSchema = z.enum(['main', 'ai_languageModel', 'ai_tool']);
const connectionEntrySchema = z.object({ node: z.string(), type: connectionTypeSchema, index: z.number() });

const connectionsSchema = z.record(
  z.string(),
  z.record(connectionTypeSchema, z.array(z.array(connectionEntrySchema))),
);

export const createWorkflowSchema = z.object({
  name: z.string().min(1),
  folderId: z.string().nullable().optional(),
  active: z.boolean().optional().default(false),
  nodes: z.array(nodeSchema),
  connections: connectionsSchema,
  settings: dataObjectSchema.nullable().optional(),
});

export const updateWorkflowSchema = createWorkflowSchema.partial().extend({
  starred: z.boolean().optional(),
  /** null moves the workflow out of every folder; a string moves it into that folder. */
  folderId: z.string().nullable().optional(),
});

/** The library's sidebar views. `all` hides trashed workflows; `trash` shows only those. */
export const listWorkflowsQuerySchema = z.object({
  view: z.enum(['all', 'starred', 'trash']).optional().default('all'),
  folderId: z.string().optional(),
});

export const executeWorkflowSchema = z.object({
  startNodeName: z.string().optional(),
  data: z.array(dataObjectSchema).optional(),
  destinationNode: z.string().optional(),
});
