import type { IDataObject } from '@runnel/workflow';

/**
 * One hand-authored usage example per node type — a realistic `parameters` object, not the
 * node's own (often empty-string/zero) defaults, which teach the model nothing about actual
 * usage. Per the build prompt's get_node_schema spec: "keep required fields, defaults, and one
 * usage example." Missing an entry is fine (compressNodeSchema omits the field rather than
 * fabricating one) — add one here the first time an eval shows the model guessing wrong on a
 * node's parameter shape.
 */
export const NODE_USAGE_EXAMPLES: Record<string, IDataObject> = {
  manualTrigger: {},
  chatTrigger: {},
  start: {},
  noOp: {},
  set: { mode: 'manual', fields: { values: [{ name: 'status', type: 'string', value: 'processed' }] } },
  if: { combinator: 'and', conditions: { values: [{ leftValue: '={{ $json.amount }}', operator: 'gt', rightValue: '100' }] } },
  filter: { combinator: 'and', conditions: { values: [{ leftValue: '={{ $json.status }}', operator: 'equals', rightValue: 'active' }] } },
  merge: { mode: 'combineByKey', key: 'id' },
  splitInBatches: { batchSize: 10 },
  httpRequest: { method: 'GET', url: '=https://api.example.com/users/{{ $json.id }}' },
  code: { mode: 'runOnceForEachItem', language: 'javaScript', jsCode: 'item.json.processed = true;\nreturn item;' },
  scheduleTrigger: { interval: 1, unit: 'days' },
  webhook: { httpMethod: 'POST', path: 'my-hook', responseMode: 'onReceived' },
  pollTrigger: { pollIntervalSeconds: 300 },
  switch: { rules: { values: [{ outputIndex: 0, leftValue: '={{ $json.tier }}', operator: 'equals', rightValue: 'gold' }] } },
  sort: { field: 'createdAt', order: 'descending' },
  limit: { maxItems: 10 },
  removeDuplicates: { compare: 'field', field: 'email' },
  renameKeys: { renames: { values: [{ from: 'old_field', to: 'newField' }] } },
  postgres: { query: '=SELECT * FROM users WHERE id = {{ $json.id }}' },
  aiAgent: { systemPrompt: 'You are a helpful assistant.', prompt: '={{ $json.chatInput }}' },
  lmChatOpenAi: { model: 'gpt-4o-mini', temperature: 0.7 },
  toolCalculator: {},
};
