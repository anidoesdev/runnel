import type { IEvalCase } from '../types.js';

/**
 * Prompts missing a genuinely required, no-default, business-meaning-bearing field (a SQL
 * query, a URL, a sort key, a filter condition) — exactly the "unknowable from context" case
 * the system prompt's working-order policy says to ask about rather than guess. Some of these
 * are deliberately harder than the single-node-build cases (e.g. the `if`/`filter` conditions
 * aren't flagged `required` at the schema level, so recognizing the ambiguity takes judgment,
 * not just reading unsetRequiredParams) — that's the point of having them: a v1 eval suite
 * should surface where the prompt doesn't yet reliably do the right thing, not just confirm
 * cases it already handles.
 */
export const CLARIFYING_QUESTION_CASES: IEvalCase[] = [
  {
    id: 'ask-then-continue-postgres-query',
    prompt: 'run a query against my database and get me the good stuff',
    autoResume: { answers: { query: 'SELECT * FROM orders WHERE status = \'open\'' } },
    assertions: [{ type: 'calls_tool', name: 'ask_user' }, { type: 'uses_node_type', nodeType: 'postgres' }, { type: 'ends_idle' }],
  },
  {
    id: 'ask-then-continue-http-url',
    prompt: 'hit an api for me and grab the response',
    autoResume: { answers: { url: 'https://api.example.com/data' } },
    assertions: [{ type: 'calls_tool', name: 'ask_user' }, { type: 'uses_node_type', nodeType: 'httpRequest' }, { type: 'ends_idle' }],
  },
  {
    id: 'ask-then-continue-sort-field',
    prompt: 'sort my data for me',
    autoResume: { answers: { field: 'createdAt' } },
    assertions: [{ type: 'calls_tool', name: 'ask_user' }, { type: 'uses_node_type', nodeType: 'sort' }, { type: 'ends_idle' }],
  },
  {
    id: 'ask-pause-if-vague-condition',
    prompt: 'branch based on whether something is true, you know what I mean',
    assertions: [{ type: 'calls_tool', name: 'ask_user' }],
  },
  {
    id: 'ask-pause-filter-vague',
    prompt: 'filter it down to just the good ones',
    assertions: [{ type: 'calls_tool', name: 'ask_user' }],
  },
  {
    id: 'ask-pause-postgres-and-important',
    prompt: 'query the db and only get me the important rows',
    assertions: [{ type: 'calls_tool', name: 'ask_user' }],
  },
];
