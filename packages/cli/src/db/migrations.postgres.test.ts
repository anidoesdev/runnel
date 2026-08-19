import { Client } from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataSource } from './data-source.js';
import type { DataSource } from 'typeorm';
import type { IDatabaseConfig } from './data-source.js';

/**
 * Runs the same migration up/down/round-trip checks as migrations.sqlite.test.ts, against a
 * real Postgres server — proving the migration actually works on both dialects, not just
 * that its TypeScript compiles. Requires a reachable Postgres (see env vars below); skips
 * with a clear message rather than failing when none is configured, so `pnpm test` stays
 * green on machines without Postgres — CI always has the service container from
 * .github/workflows/ci.yml, so it's exercised for real there regardless.
 *
 * The availability check runs as a top-level await, before any `describe`/`it` calls: vitest
 * resolves `describe.skipIf`'s condition at collection time, which happens *before* any
 * `beforeAll` hook would run, so the check can't live inside one here.
 */
const postgresConfig: Extract<IDatabaseConfig, { type: 'postgres' }> = {
  type: 'postgres',
  host: process.env.TEST_POSTGRES_HOST ?? 'localhost',
  port: Number(process.env.TEST_POSTGRES_PORT ?? 5433),
  username: process.env.TEST_POSTGRES_USER ?? 'postgres',
  password: process.env.TEST_POSTGRES_PASSWORD ?? 'postgres',
  database: process.env.TEST_POSTGRES_DATABASE ?? 'n8n_clone_test',
};

async function checkPostgresAvailable(): Promise<boolean> {
  const client = new Client({
    host: postgresConfig.host,
    port: postgresConfig.port,
    user: postgresConfig.username,
    password: postgresConfig.password,
    database: postgresConfig.database,
    connectionTimeoutMillis: 2000,
  });
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
    `\n[migrations.postgres.test.ts] No reachable Postgres at ${postgresConfig.host}:${postgresConfig.port} — skipping. ` +
      'Set TEST_POSTGRES_* env vars, or run:\n' +
      '  docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=n8n_clone_test -p 5433:5432 postgres:16-alpine\n',
  );
}

let dataSource: DataSource | undefined;

afterEach(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  dataSource = undefined;
});

async function tableNames(ds: DataSource): Promise<string[]> {
  const rows = (await ds.query(
    "SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public'",
  )) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe.skipIf(!postgresAvailable)('Postgres migrations', () => {
  it('creates all four tables on up, and drops them all on down', async () => {
    dataSource = createDataSource(postgresConfig);
    await dataSource.initialize();

    await dataSource.runMigrations();
    const afterUp = (await tableNames(dataSource)).sort();
    expect(afterUp).toEqual(['assistant_session', 'credential', 'execution', 'migrations', 'user', 'workflow']);

    // Two migrations now (InitialSchema, AddAssistantSession) — undoLastMigration only reverts
    // the most recently applied one, so a full teardown needs one call per migration.
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    const afterDown = await tableNames(dataSource);
    expect(afterDown).not.toContain('workflow');
    expect(afterDown).not.toContain('user');
    expect(afterDown).not.toContain('credential');
    expect(afterDown).not.toContain('execution');
    expect(afterDown).not.toContain('assistant_session');
  });

  it('round-trips a real row through the workflow table (simple-json column)', async () => {
    dataSource = createDataSource(postgresConfig);
    await dataSource.initialize();
    await dataSource.runMigrations();

    const nodesJson = JSON.stringify([
      { id: 'n1', name: 'Start', type: 'start', typeVersion: 1, position: [0, 0], parameters: {} },
    ]);
    await dataSource.query(
      'INSERT INTO workflow (id, name, active, nodes, connections) VALUES ($1, $2, $3, $4, $5)',
      ['w1', 'Test Workflow', false, nodesJson, '{}'],
    );
    const [row] = (await dataSource.query('SELECT nodes FROM workflow WHERE id = $1', ['w1'])) as Array<{
      nodes: string;
    }>;
    expect(JSON.parse(row!.nodes)).toEqual([
      { id: 'n1', name: 'Start', type: 'start', typeVersion: 1, position: [0, 0], parameters: {} },
    ]);

    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
  });

  it('can migrate up, down, and back up again cleanly (idempotent in both directions)', async () => {
    dataSource = createDataSource(postgresConfig);
    await dataSource.initialize();

    await dataSource.runMigrations();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();

    const names = (await tableNames(dataSource)).sort();
    expect(names).toEqual(['assistant_session', 'credential', 'execution', 'migrations', 'user', 'workflow']);

    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
  });
});
