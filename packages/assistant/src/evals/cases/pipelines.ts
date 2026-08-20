import type { IEvalCase } from '../types.js';

/** Multi-step asks — the same request a user would type in one breath, chaining two or three capabilities together. */
export const PIPELINE_CASES: IEvalCase[] = [
  {
    id: 'trigger-call-filter-sort',
    prompt: 'when I run it manually, call an api, then only keep the active results, then sort them by date',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'manualTrigger' },
      { type: 'uses_node_type', nodeType: 'httpRequest' },
      { type: 'uses_node_type', nodeType: 'filter' },
      { type: 'uses_node_type', nodeType: 'sort' },
      { type: 'node_count_at_least', count: 4 },
    ],
  },
  {
    id: 'poll-code-postgres',
    prompt: 'poll an endpoint, run it through some js to clean it up, then save it into postgres',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'pollTrigger' },
      { type: 'uses_node_type', nodeType: 'code' },
      { type: 'uses_node_type', nodeType: 'postgres' },
    ],
  },
  {
    id: 'webhook-branch-two-paths',
    prompt: 'when a webhook comes in, check a condition and do something different depending on which way it goes',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'webhook' },
      { type: 'uses_node_type', nodeType: 'if' },
    ],
  },
  {
    id: 'schedule-query-limit',
    prompt: 'every day, pull rows from postgres and just grab the first 20',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'scheduleTrigger' },
      { type: 'uses_node_type', nodeType: 'postgres' },
      { type: 'uses_node_type', nodeType: 'limit' },
    ],
  },
  {
    id: 'manual-dedupe-rename',
    prompt: 'run it by hand, remove dupes by email, then fix up a field name',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'manualTrigger' },
      { type: 'uses_node_type', nodeType: 'removeDuplicates' },
      { type: 'uses_node_type', nodeType: 'renameKeys' },
    ],
  },
  {
    id: 'chat-agent-with-calculator-pipeline',
    prompt: 'i want people to be able to chat with a bot that can do calculations for them',
    assertions: [
      { type: 'no_tool_errors' },
      { type: 'uses_node_type', nodeType: 'chatTrigger' },
      { type: 'uses_node_type', nodeType: 'aiAgent' },
      { type: 'uses_node_type', nodeType: 'toolCalculator' },
      { type: 'uses_node_type', nodeType: 'lmChatOpenAi' },
    ],
  },
];
