import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { toModelToolDefinitions } from './tool-definitions.js';
import type { AnyTool, ITool } from '@n8n-clone/workflow-tools';

describe('toModelToolDefinitions', () => {
  it('carries the name and description through unchanged', () => {
    const tool: ITool<{ value: string }, unknown> = {
      name: 'echo',
      description: 'echoes a value',
      parameters: z.object({ value: z.string() }),
      handler: () => undefined,
    };
    const [definition] = toModelToolDefinitions([tool as unknown as AnyTool]);
    expect(definition!).toMatchObject({ name: 'echo', description: 'echoes a value' });
  });

  it('renders a bounded number as a numeric exclusiveMinimum, not the OpenAPI boolean-flag form OpenAI\'s function schema validator rejects', () => {
    const tool: ITool<{ limit?: number }, unknown> = {
      name: 'search',
      description: 'test',
      parameters: z.object({ limit: z.number().int().positive().max(50).optional() }),
      handler: () => undefined,
    };
    const [definition] = toModelToolDefinitions([tool as unknown as AnyTool]);
    const properties = (definition!.parameters as { properties: Record<string, unknown> }).properties;
    const limit = properties.limit as { exclusiveMinimum?: unknown };

    expect(typeof limit.exclusiveMinimum).toBe('number');
    expect(limit.exclusiveMinimum).toBe(0);
  });

  it('strips the $schema metadata key — a parameters object should contain only the schema itself', () => {
    const tool: ITool<{ value: string }, unknown> = {
      name: 'echo',
      description: 'test',
      parameters: z.object({ value: z.string() }),
      handler: () => undefined,
    };
    const [definition] = toModelToolDefinitions([tool as unknown as AnyTool]);
    expect(definition!.parameters).not.toHaveProperty('$schema');
  });
});
