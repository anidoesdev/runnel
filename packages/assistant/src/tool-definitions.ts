import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AnyTool } from '@n8n-clone/workflow-tools';
import type { IModelToolDefinition } from './model-provider.js';

/** Converts the tool registry's Zod parameter schemas into the JSON-Schema shape every model-calling API (OpenAI function calling, Anthropic tool use) expects. Kept in this package, not workflow-tools — the tool registry itself has no reason to know about JSON Schema, only about validating the arguments it's actually given. */
export function toModelToolDefinitions(tools: Iterable<AnyTool>): IModelToolDefinition[] {
  return [...tools].map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.parameters, { target: 'openApi3', $refStrategy: 'none' }),
  }));
}
