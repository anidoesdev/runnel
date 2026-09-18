import type { IEvalCase } from '../types.js';

/**
 * Recalled memory changing what gets built. Each case targets a parameter whose default is the
 * *other* value (a Webhook's method defaults to GET and its response mode to "immediately"), so a
 * case only passes if the model actually read and applied the memory block — building the
 * default would fail it. The last two check the guard rails: the current message beats a
 * remembered preference, and an unrelated memory doesn't get dragged into the build.
 *
 * Kept out of ALL_EVAL_CASES: run-evals adds them only with RUNNEL_EVAL_MEMORY=true, so the
 * default suite's score doesn't move when memory isn't being worked on.
 */
export const MEMORY_CASES: IEvalCase[] = [
  {
    id: 'memory-webhook-method-preference',
    prompt: 'add a webhook trigger on the path orders',
    recalledMemories: [{ id: 'm1', kind: 'preference', content: "The user's webhook nodes always accept POST requests, never GET." }],
    assertions: [
      { type: 'uses_node_type', nodeType: 'webhook' },
      // No `no_tool_errors`: guessing a parameter name, being told the valid ones and correcting
      // is the intended path now, and this case scores whether the preference ended up applied.
      { type: 'node_parameter_equals', nodeType: 'webhook', parameter: 'httpMethod', value: 'POST' },
    ],
  },
  {
    id: 'memory-webhook-response-mode-preference',
    prompt: 'I need a webhook at /signup that kicks off the rest of the flow',
    recalledMemories: [
      { id: 'm1', kind: 'preference', content: 'The user wants webhook nodes to respond only when the last node finishes, so callers get the result.' },
    ],
    assertions: [
      { type: 'uses_node_type', nodeType: 'webhook' },
      { type: 'node_parameter_equals', nodeType: 'webhook', parameter: 'responseMode', value: 'lastNode' },
    ],
  },
  {
    id: 'memory-current-message-wins',
    prompt: 'add a webhook at /ping that answers straight away, before anything else runs',
    recalledMemories: [
      { id: 'm1', kind: 'preference', content: 'The user wants webhook nodes to respond only when the last node finishes, so callers get the result.' },
    ],
    assertions: [
      { type: 'uses_node_type', nodeType: 'webhook' },
      { type: 'node_parameter_equals', nodeType: 'webhook', parameter: 'responseMode', value: 'onReceived' },
    ],
  },
  {
    id: 'memory-unrelated-memory-ignored',
    prompt: 'add a webhook trigger on the path contact',
    recalledMemories: [{ id: 'm1', kind: 'fact', content: "The user's reporting workflows read from a Postgres database." }],
    assertions: [
      { type: 'uses_node_type', nodeType: 'webhook' },
      { type: 'does_not_use_node_type', nodeType: 'postgres' },
    ],
  },
];
