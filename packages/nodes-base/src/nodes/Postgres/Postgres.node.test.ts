import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postgresNode } from './Postgres.node.js';
import { makeExecuteFunctions, makeNode } from '../../test-utils.js';

/**
 * Runs against the same real Postgres used by packages/cli's migration tests (see
 * migrations.postgres.test.ts for the full rationale) — proving the node actually talks to a
 * database, not just that it compiles. Skips with a clear message when no Postgres is
 * reachable, so `pnpm test` stays green on machines without one; CI always has the service
 * container from .github/workflows/ci.yml.
 */
const credentials = {
  host: process.env.TEST_POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.TEST_POSTGRES_PORT ?? 5433),
  database: process.env.TEST_POSTGRES_DATABASE ?? 'n8n_clone_test',
  user: process.env.TEST_POSTGRES_USER ?? 'postgres',
  password: process.env.TEST_POSTGRES_PASSWORD ?? 'postgres',
  ssl: false,
};

async function checkPostgresAvailable(): Promise<boolean> {
  const client = new Client({ ...credentials, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

const postgresAvailable = await checkPostgresAvailable();
if (!postgresAvailable) {
  console.warn(
    `\n[Postgres.node.test.ts] No reachable Postgres at ${credentials.host}:${credentials.port} — skipping. ` +
      'Set TEST_POSTGRES_* env vars, or run:\n' +
      '  docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=n8n_clone_test -p 5433:5432 postgres:16-alpine\n',
  );
}

describe.skipIf(!postgresAvailable)('Postgres node', () => {
  let setupClient: Client;

  beforeAll(async () => {
    setupClient = new Client(credentials);
    await setupClient.connect();
    await setupClient.query('DROP TABLE IF EXISTS nodes_base_postgres_node_test');
    await setupClient.query('CREATE TABLE nodes_base_postgres_node_test (id INTEGER PRIMARY KEY, name TEXT)');
    await setupClient.query(
      "INSERT INTO nodes_base_postgres_node_test (id, name) VALUES (1, 'Ada'), (2, 'Grace')",
    );
  });

  afterAll(async () => {
    await setupClient.query('DROP TABLE IF EXISTS nodes_base_postgres_node_test');
    await setupClient.end();
  });

  it('runs a query and emits one output item per returned row', async () => {
    const node = makeNode({
      name: 'Postgres',
      type: 'postgres',
      parameters: { query: 'SELECT * FROM nodes_base_postgres_node_test ORDER BY id' },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], { node, credentialsResolver: async () => credentials });

    const result = await postgresNode.execute!.call(ctx);
    expect(result[0]).toEqual([
      { json: { id: 1, name: 'Ada' }, pairedItem: { item: 0 } },
      { json: { id: 2, name: 'Grace' }, pairedItem: { item: 0 } },
    ]);
  });

  it('runs once per input item, resolving an expression against each item', async () => {
    const node = makeNode({
      name: 'Postgres',
      type: 'postgres',
      parameters: { query: '={{ "SELECT * FROM nodes_base_postgres_node_test WHERE id = " + $json.id }}' },
    });
    const ctx = makeExecuteFunctions([{ json: { id: 1 } }, { json: { id: 2 } }], {
      node,
      credentialsResolver: async () => credentials,
    });

    const result = await postgresNode.execute!.call(ctx);
    expect(result[0]).toEqual([
      { json: { id: 1, name: 'Ada' }, pairedItem: { item: 0 } },
      { json: { id: 2, name: 'Grace' }, pairedItem: { item: 1 } },
    ]);
  });

  it('returns no output items for a query that matches nothing', async () => {
    const node = makeNode({
      name: 'Postgres',
      type: 'postgres',
      parameters: { query: 'SELECT * FROM nodes_base_postgres_node_test WHERE id = 999' },
    });
    const ctx = makeExecuteFunctions([{ json: {} }], { node, credentialsResolver: async () => credentials });

    const result = await postgresNode.execute!.call(ctx);
    expect(result[0]).toEqual([]);
  });
});
