import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it } from 'vitest';
import { createDataSource, sqliteConfig } from '../../db/data-source.js';
import { CredentialEntity } from '../../db/entities/Credential.entity.js';
import { createLogger } from '../../logging/logger.js';
import { createAssistantMemory } from './memory.factory.js';
import { MemnestMemoryAdapter } from './memnest-memory.adapter.js';
import { NullMemoryAdapter } from './null-memory.adapter.js';
import type { DataSource } from 'typeorm';
import type { IAssistantMemory } from './memory.factory.js';
import type { IMemoryConfig } from '../../config.js';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A real Runnel database file, migrated the way server.ts does it, so table assertions see exactly what a developer's database would. */
async function migratedDatabaseFile(): Promise<{ file: string; dataSource: DataSource }> {
  const dir = mkdtempSync(join(tmpdir(), 'runnel-memory-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'runnel.sqlite');
  const dataSource = createDataSource(sqliteConfig(file));
  await dataSource.initialize();
  await dataSource.runMigrations();
  cleanups.push(() => dataSource.destroy());
  return { file, dataSource };
}

async function tableNames(dataSource: DataSource): Promise<string[]> {
  const rows = (await dataSource.query("SELECT name FROM sqlite_master WHERE type = 'table'")) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function capturingLogger() {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk: Buffer) => (text += chunk.toString()));
  return {
    logger: createLogger({ level: 'info', destination: stream }),
    lines: () =>
      text
        .split('\n')
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as { level: number; msg: string }),
  };
}

async function build(config: IMemoryConfig, dataSource: DataSource, db: { type: 'sqlite'; database: string } | { type: 'postgres' }) {
  const log = capturingLogger();
  const memory: IAssistantMemory = await createAssistantMemory({
    memory: config,
    db,
    logger: log.logger,
    credentials: dataSource.getRepository(CredentialEntity),
    encryptionKey: 'test-encryption-key',
    resolveOpenAi: async () => {
      throw new Error('no model in tests');
    },
  });
  cleanups.push(() => memory.close());
  return { memory, log };
}

describe('createAssistantMemory', () => {
  it('both flags off: no-op adapter, and no Memnest tables in the database', async () => {
    const { file, dataSource } = await migratedDatabaseFile();
    const before = await tableNames(dataSource);

    const { memory } = await build({ capture: false, recall: false, tokenBudget: 400 }, dataSource, { type: 'sqlite', database: file });

    expect(memory.port).toBeInstanceOf(NullMemoryAdapter);
    expect(await tableNames(dataSource)).toEqual(before);
  });

  it('capture on: Memnest adapter, its own memnest_* tables migrated, and Runnel\'s tables untouched', async () => {
    const { file, dataSource } = await migratedDatabaseFile();
    const before = await tableNames(dataSource);

    const { memory } = await build({ capture: true, recall: false, tokenBudget: 400 }, dataSource, { type: 'sqlite', database: file });

    expect(memory.port).toBeInstanceOf(MemnestMemoryAdapter);
    const after = await tableNames(dataSource);
    expect(after).toEqual(expect.arrayContaining(before));
    const added = after.filter((name) => !before.includes(name));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((name) => name.startsWith('memnest_'))).toBe(true);

    // Runnel's own connection keeps working alongside Memnest's.
    await expect(dataSource.query('SELECT COUNT(*) AS n FROM workflow')).resolves.toBeDefined();
  });

  it('recall on without capture: still starts, with a warning', async () => {
    const { file, dataSource } = await migratedDatabaseFile();
    const { memory, log } = await build({ capture: false, recall: true, tokenBudget: 400 }, dataSource, { type: 'sqlite', database: file });

    expect(memory.port).toBeInstanceOf(MemnestMemoryAdapter);
    expect(log.lines().some((line) => line.level === 40 && line.msg.includes('RUNNEL_MEMORY_CAPTURE is off'))).toBe(true);
  });

  it('Postgres: stays disabled with a warning until the Postgres store is wired (R6)', async () => {
    const { dataSource } = await migratedDatabaseFile();
    const { memory, log } = await build({ capture: true, recall: false, tokenBudget: 400 }, dataSource, { type: 'postgres' });

    expect(memory.port).toBeInstanceOf(NullMemoryAdapter);
    expect(log.lines().some((line) => line.level === 40 && line.msg.includes('Postgres'))).toBe(true);
  });

  it('a Memnest startup failure disables memory instead of failing the server', async () => {
    const { dataSource } = await migratedDatabaseFile();
    const unopenable = join(tmpdir(), 'runnel-memory-missing-dir', 'nested', 'db.sqlite');
    const { memory, log } = await build({ capture: true, recall: false, tokenBudget: 400 }, dataSource, { type: 'sqlite', database: unopenable });

    expect(memory.port).toBeInstanceOf(NullMemoryAdapter);
    expect(log.lines().some((line) => line.level === 50 && line.msg.includes('failed to start'))).toBe(true);
  });
});
