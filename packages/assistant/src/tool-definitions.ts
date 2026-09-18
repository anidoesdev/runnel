import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnyTool } from '@runnel/workflow-tools';
import type { IModelToolDefinition } from './model-provider.js';

/**
 * Converts the tool registry's Zod parameter schemas into the JSON-Schema shape every
 * model-calling API (OpenAI function calling, Anthropic tool use) expects.
 *
 * Deliberately NOT `target: 'openApi3'`: that dialect renders a bounded number (e.g.
 * `z.number().positive()`) as `{ exclusiveMinimum: true, minimum: 0 }` — a boolean flag paired
 * with a separate bound, valid OpenAPI 3.0 but not standard JSON Schema. OpenAI's function
 * schema validator expects the plain-JSON-Schema form, `{ exclusiveMinimum: 0 }`, and rejects
 * the OpenAPI form outright ("True is not of type 'number'"). The default target
 * (jsonSchema7) emits the form that actually works; its `$schema` metadata key is stripped
 * since a `parameters` object should contain only the schema itself.
 */
export function toModelToolDefinitions(tools: Iterable<AnyTool>): IModelToolDefinition[] {
  return [...tools].map((tool) => {
    const schema = zodToJsonSchema(tool.parameters, { $refStrategy: 'none' }) as Record<string, unknown>;
    delete schema.$schema;
    return { name: tool.name, description: tool.description, parameters: schema };
  });
}
