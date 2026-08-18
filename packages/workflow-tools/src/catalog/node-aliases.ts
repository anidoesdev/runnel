/**
 * Hand-seeded synonyms, brand names, and outcome phrases that don't appear in a node's own
 * displayName/description, so a query like "db", "cron", or "notify my team" still surfaces the
 * right node. Per the build prompt: "This unglamorous table is worth more than a better
 * embedding model." Extend an entry whenever an eval query fails to put the right node in the
 * top 3 — see search-nodes.eval.test.ts.
 */
export const NODE_ALIASES: Record<string, string[]> = {
  manualTrigger: ['manual run', 'test run', 'run manually', 'button'],
  chatTrigger: ['chat', 'conversation', 'chat message', 'talk to', 'chatbot input'],
  start: ['begin', 'entry point'],
  noOp: ['do nothing', 'passthrough', 'no operation', 'placeholder'],
  set: ['edit fields', 'assign', 'set field', 'add field', 'transform data', 'map fields'],
  if: ['condition', 'branch', 'true false', 'conditional'],
  merge: ['combine', 'join', 'union', 'zip', 'append lists'],
  splitInBatches: ['loop', 'batch', 'iterate', 'for each', 'loop over items', 'chunk'],
  httpRequest: ['api', 'rest', 'fetch', 'call an api', 'get request', 'post request', 'endpoint', 'curl'],
  code: ['javascript', 'js', 'script', 'custom code', 'function', 'run code'],
  scheduleTrigger: ['cron', 'timer', 'interval', 'periodic', 'every day', 'recurring', 'schedule'],
  webhook: ['incoming webhook', 'http endpoint', 'receive request', 'listen for'],
  pollTrigger: ['poll', 'check periodically', 'watch for changes', 'rss'],
  switch: ['route', 'multiple branches', 'case', 'switch statement'],
  filter: ['where', 'filter items', 'keep matching', 'exclude'],
  sort: ['order by', 'sort items', 'rank'],
  limit: ['top n', 'first n', 'take', 'truncate list'],
  removeDuplicates: ['dedupe', 'deduplicate', 'unique', 'distinct'],
  renameKeys: ['rename field', 'rename column', 'rename property'],
  postgres: ['db', 'database', 'sql', 'query', 'table', 'postgresql'],
  aiAgent: ['agent', 'ai assistant', 'llm agent', 'chatbot', 'autonomous agent'],
  lmChatOpenAi: ['gpt', 'openai', 'llm', 'chat model', 'chatgpt', 'language model'],
  toolCalculator: ['calculator', 'math', 'arithmetic', 'compute', 'evaluate expression'],
};
