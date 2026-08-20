import { redactDeep } from '../redact.js';
import type { IDataObject, INodeExecutionData } from '@n8n-clone/workflow';

function coarseType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/** Field name -> coarse type, from one item's top-level json keys — enough for the agent to write `$json.foo` against real field names without seeing the actual values. */
export function inferItemSchema(json: IDataObject): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const [key, value] of Object.entries(json)) {
    schema[key] = coarseType(value);
  }
  return schema;
}

/** get_node_output's sample redaction — see redactDeep for the general-purpose version every tool result also goes through. */
export function redactSample(json: IDataObject): IDataObject {
  return redactDeep(json);
}

export function firstItem(output: INodeExecutionData[] | undefined): INodeExecutionData | undefined {
  return output?.[0];
}
