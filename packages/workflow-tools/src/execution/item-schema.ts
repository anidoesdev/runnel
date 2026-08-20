import type { IDataObject, IDataObjectValue, INodeExecutionData } from '@n8n-clone/workflow';

/** Field names get_node_output's sample redacts (case-insensitive substring match) — the last line of defense per Part 5 Safety's "credential values never enter the transcript", for the case where a real response happens to echo one back (e.g. an API returning the Authorization header it received). */
const SECRET_KEY_PATTERN = /password|secret|token|apikey|api_key|authorization|credential/i;

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

function redactValue(key: string, value: IDataObjectValue): IDataObjectValue {
  if (SECRET_KEY_PATTERN.test(key)) return '[redacted]';
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return redactSample(value as IDataObject);
  }
  return value;
}

/** Replaces any secret-shaped field (by key name, recursively) with a fixed placeholder — never the real value, so the agent can still see *that* a field exists without it entering the transcript. */
export function redactSample(json: IDataObject): IDataObject {
  const redacted: IDataObject = {};
  for (const [key, value] of Object.entries(json)) {
    redacted[key] = redactValue(key, value);
  }
  return redacted;
}

export function firstItem(output: INodeExecutionData[] | undefined): INodeExecutionData | undefined {
  return output?.[0];
}
