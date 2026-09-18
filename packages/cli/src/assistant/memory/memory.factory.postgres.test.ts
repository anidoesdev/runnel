import { PassThrough } from 'node:stream';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { hashEmbedder } from '@memnest/core/testing';
import { createSession } from '@runnel/assistant';
import { createDataSource, sqliteConfig } from '../../db/data-source.js';
import { CredentialEntity } from '../../db/entities/Credential.entity.js';
import { createLogger } from '../../logging/logger.js';
import { createAssistantMemory } from './memory.factory.js';
import { MemnestMemoryAdapter } from './memnest-memory.adapter.js';
import { NullMemoryAdapter } from './null-memory.adapter.js';
import type { IAssistantMemory } from './memory.factory.js';

/**
 * Memory on real Postgres servers — skipped unless they're provided, like the other Postgres
 * suites in this package. CI runs a pgvector image; locally:
 *
 *   docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=runnel_test -p 55432:5432 pgvector/pgvector:pg16
 *   docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=runnel_test -p 55433:5432 postgres:16-alpine
 *   TEST_MEMORY_PG_URL=postgres://postgres:postgres@localhost:55432/runnel_test \
 *   TEST_PLAIN_PG_URL=postgres://postgres:postgres@localhost:55433/runnel_test pnpm test
 */
const PGVECTOR_URL = process.env.TEST_MEMORY_PG_URL;
const PLAIN_URL = process.env.TEST_PLAIN_PG_URL;

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function capturingLogger() {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk: Buffer) => (text += chunk.toString()));
  return {
    logger: createLogger({ level: 'info', destination: stream }),
    lines: () => text.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as { level: number; msg: string }),
  };
}

async function build(postgresUrl: string) {
  const dataSource = createDataSource(sqliteConfig(':memory:'));
  await dataSource.initialize();
  await dataSource.runMigrations();
  cleanups.push(() => dataSource.destroy());
  const log = capturingLogger();
  const memory: IAssistantMemory = await createAssistantMemory({
    memory: { capture: true, recall: true, tokenBudget: 400, minScore: 0 },
    db: { type: 'postgres' },
    logger: log.logger,
    credentials: dataSource.getRepository(CredentialEntity),
    encryptionKey: 'test-encryption-key',
    postgresUrl,
    embedder: hashEmbedder({ dimensions: 64 }),
    resolveOpenAi: async () => {
      throw new Error('no model in tests');
    },
  });
  cleanups.push(() => memory.close());
  return { memory, log };
}

async function dropMemnestSchema(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  await pool.query('DROP SCHEMA IF EXISTS memnest CASCADE');
  await pool.end();
}

describe.skipIf(!PGVECTOR_URL)('assistant memory on Postgres with pgvector', () => {
  it('migrates its own schema and runs hybrid (keyword + semantic) recall', async () => {
    await dropMemnestSchema(PGVECTOR_URL!);
    const { memory, log } = await build(PGVECTOR_URL!);

    expect(memory.port).toBeInstanceOf(MemnestMemoryAdapter);
    expect(log.lines().some((line) => line.msg.includes('keyword + semantic recall'))).toBe(true);

    const pool = new pg.Pool({ connectionString: PGVECTOR_URL, max: 1 });
    cleanups.push(() => pool.end());
    const { rowCount } = await pool.query("SELECT 1 FROM information_schema.schemata WHERE schema_name = 'memnest'");
    expect(rowCount).toBe(1);

    const session = createSession({ id: 'pg-session-1', workflowId: 'wf', draftId: 'd', actor: { userId: 'pg-user', scopes: [] }, tokenLimit: 100_000 });
    session.messages = [{ role: 'user', content: 'Webhook nodes must always verify HMAC signatures.' }];
    await memory.port.capture(session);

    const recalled = await memory.port.recall('webhook HMAC signatures', { userId: 'pg-user', scopes: [] }, 400);
    // No extraction model in tests, so no memories yet — but the trace proves the semantic path ran.
    expect((recalled.trace as { degraded?: string }).degraded ?? '').not.toMatch(/lexical-only/);
  });
});

describe.skipIf(!PLAIN_URL)('assistant memory on Postgres without pgvector', () => {
  it('stays disabled with a warning that names the missing extension', async () => {
    const { memory, log } = await build(PLAIN_URL!);

    expect(memory.port).toBeInstanceOf(NullMemoryAdapter);
    expect(log.lines().some((line) => line.level === 40 && line.msg.includes('pgvector'))).toBe(true);
  });
});
