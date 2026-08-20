import type { IEvalCase } from '../types.js';

/**
 * Prompts phrased the way a user actually types — casual, imperative, under-specified where a
 * real request would be — not the precise "add an httpRequest node named X" a test author would
 * default to. Per Part 7: source from real language, not your own phrasing. Absent a live
 * community-forum corpus to pull from in this environment, these are hand-authored in that
 * register instead; swapping in real forum text is a reasonable follow-up once available.
 */
export const SINGLE_NODE_BUILD_CASES: IEvalCase[] = [
  {
    id: 'manual-trigger-http',
    prompt: 'I just want a button I can click to call an api',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'manualTrigger' }, { type: 'uses_node_type', nodeType: 'httpRequest' }],
  },
  {
    id: 'schedule-trigger',
    prompt: 'run this thing every morning automatically',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'scheduleTrigger' }],
  },
  {
    id: 'postgres-query',
    prompt: 'I need to run a query against my postgres db',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'postgres' }],
  },
  {
    id: 'custom-code',
    prompt: 'let me write some custom js to mess with the data',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'code' }],
  },
  {
    id: 'noop-placeholder',
    prompt: 'add a placeholder step, doesn\'t need to do anything yet',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'noOp' }],
  },
  {
    id: 'webhook-listener',
    prompt: 'i want an endpoint external systems can hit to kick this off',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'webhook' }],
  },
  {
    id: 'poll-trigger',
    prompt: 'check an endpoint every few minutes for changes',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'pollTrigger' }],
  },
  {
    id: 'chat-with-agent',
    prompt: 'i want to be able to just chat with an ai agent',
    assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'chatTrigger' }, { type: 'uses_node_type', nodeType: 'aiAgent' }],
  },
];
