import { z } from 'zod';
import type { IDataObject, IDataObjectValue } from '@runnel/workflow';

/**
 * Mirrors IDataObjectValue's recursive shape exactly (rather than `z.record(z.unknown())`,
 * whose inferred output type is `Record<string, unknown>` — not assignable to IDataObject).
 * Same pattern as packages/cli/src/workflows/workflow.dto.ts; duplicated rather than imported
 * since workflow-tools must not depend on packages/cli (cli depends on workflow-tools, not the
 * other way around).
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

export const dataObjectSchema = z.record(z.string(), jsonValueSchema) as z.ZodType<IDataObject>;
