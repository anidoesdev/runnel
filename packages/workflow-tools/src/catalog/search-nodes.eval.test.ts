import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { registerAllNodeTypes } from '@runnel/nodes-base';
import { searchNodeTypes } from './search-nodes.js';

/**
 * Milestone 2's own bar: "search_nodes top-3 accuracy >90% on 50 hand-labelled queries" — run
 * against the REAL registered catalog (not synthetic fixtures), phrased the way a user actually
 * asks rather than by node name, spanning brand names ("gpt"), verbs ("call a rest api"), and
 * outcomes ("notify my team"). When a query fails, the fix is almost always adding a term to
 * node-aliases.ts, not tuning BM25 — see that file's own comment.
 */
const EVAL_QUERIES: Array<{ query: string; expected: string }> = [
  { query: 'run this manually', expected: 'manualTrigger' },
  { query: 'test run button', expected: 'manualTrigger' },
  { query: 'when someone sends a chat message', expected: 'chatTrigger' },
  { query: 'start a conversation', expected: 'chatTrigger' },
  { query: 'workflow entry point', expected: 'start' },
  { query: 'do nothing', expected: 'noOp' },
  { query: 'placeholder step', expected: 'noOp' },
  { query: 'edit fields on an item', expected: 'set' },
  { query: 'assign a new field', expected: 'set' },
  { query: 'set json output manually', expected: 'set' },
  { query: 'check a condition and branch', expected: 'if' },
  { query: 'true or false branch', expected: 'if' },
  { query: 'combine two lists', expected: 'merge' },
  { query: 'join items by key', expected: 'merge' },
  { query: 'loop over items in batches', expected: 'splitInBatches' },
  { query: 'iterate through a list', expected: 'splitInBatches' },
  { query: 'call a rest api', expected: 'httpRequest' },
  { query: 'make a get request', expected: 'httpRequest' },
  { query: 'fetch data from an endpoint', expected: 'httpRequest' },
  { query: 'run custom javascript', expected: 'code' },
  { query: 'write a script to transform data', expected: 'code' },
  { query: 'run this every day', expected: 'scheduleTrigger' },
  { query: 'cron job every hour', expected: 'scheduleTrigger' },
  { query: 'receive an incoming webhook', expected: 'webhook' },
  { query: 'listen for an http post', expected: 'webhook' },
  { query: 'poll an rss feed periodically', expected: 'pollTrigger' },
  { query: 'check for changes every 5 minutes', expected: 'pollTrigger' },
  { query: 'route items to multiple outputs', expected: 'switch' },
  { query: 'case statement for routing', expected: 'switch' },
  { query: 'keep only items where status is active', expected: 'filter' },
  { query: "exclude items that don't match", expected: 'filter' },
  { query: 'order items by date', expected: 'sort' },
  { query: 'rank results descending', expected: 'sort' },
  { query: 'take the first 10 items', expected: 'limit' },
  { query: 'truncate the list to 5', expected: 'limit' },
  { query: 'remove duplicate emails', expected: 'removeDuplicates' },
  { query: 'keep only unique items', expected: 'removeDuplicates' },
  { query: 'rename a json field', expected: 'renameKeys' },
  { query: 'rename column from old to new', expected: 'renameKeys' },
  { query: 'query a sql database', expected: 'postgres' },
  { query: 'run a query against postgresql', expected: 'postgres' },
  { query: 'connect to my db', expected: 'postgres' },
  { query: 'build an ai assistant', expected: 'aiAgent' },
  { query: 'autonomous agent that uses tools', expected: 'aiAgent' },
  { query: 'chatbot that can call tools', expected: 'aiAgent' },
  { query: 'use gpt-4 as a language model', expected: 'lmChatOpenAi' },
  { query: 'connect to openai', expected: 'lmChatOpenAi' },
  { query: 'chatgpt model for the agent', expected: 'lmChatOpenAi' },
  { query: 'do math calculations', expected: 'toolCalculator' },
  { query: 'evaluate an arithmetic expression', expected: 'toolCalculator' },
];

describe('search_nodes accuracy eval', () => {
  it(`hits >90% top-3 accuracy across ${EVAL_QUERIES.length} hand-labelled queries against the real catalog`, () => {
    const catalog = registerAllNodeTypes(new MapNodeTypes()).list();
    const failures: Array<{ query: string; expected: string; got: string[] }> = [];

    for (const { query, expected } of EVAL_QUERIES) {
      const top3 = searchNodeTypes(catalog, query, 3).map((r) => r.type);
      if (!top3.includes(expected)) failures.push({ query, expected, got: top3 });
    }

    const accuracy = (EVAL_QUERIES.length - failures.length) / EVAL_QUERIES.length;
    if (failures.length > 0) {
      console.log(`search_nodes eval failures (${failures.length}/${EVAL_QUERIES.length}):`, failures);
    }
    expect(accuracy).toBeGreaterThan(0.9);
  });
});
