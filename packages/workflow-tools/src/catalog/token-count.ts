import { countTokens } from 'gpt-tokenizer';

/** Approximates how many tokens a payload will cost once serialized into a tool_result — the same measure get_node_schema's ~1500-token-per-node budget is enforced against (see schema-compression.test.ts). */
export function countJsonTokens(value: unknown): number {
  return countTokens(JSON.stringify(value));
}
