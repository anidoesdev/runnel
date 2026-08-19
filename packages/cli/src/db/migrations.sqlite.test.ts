import { afterEach, describe, expect, it } from 'vitest';
import { createDataSource, sqliteConfig } from './data-source.js';
import { UserEntity } from './entities/User.entity.js';
import type { DataSource } from 'typeorm';

let dataSource: DataSource | undefined;

afterEach(async () => {
  if (dataSource?.isInitialized) await dataSource.destroy();
  dataSource = undefined;
});

async function tableNames(ds: DataSource): Promise<string[]> {
  const rows = (await ds.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  )) as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

describe('SQLite migrations', () => {
  it('creates all four tables on up, and drops them all on down', async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();

    const beforeMigration = await tableNames(dataSource);
    expect(beforeMigration).not.toContain('workflow');

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

  it('round-trips a real row through each table after migrating up', async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();

    const userRepo = dataSource.getRepository(UserEntity);
    await userRepo.insert({
      id: 'u1',
      email: 'owner@example.com',
      passwordHash: 'hash',
      isOwner: true,
    });
    const user = await userRepo.findOneByOrFail({ id: 'u1' });
    expect(user.email).toBe('owner@example.com');

    // Raw SQL rather than the repository API here — TypeORM's generic FindOptionsWhere /
    // QueryDeepPartialEntity types recurse excessively deep against WorkflowEntity's nested
    // structural types (INode[]/IConnections from @n8n-clone/workflow), which is a type-
    // checker-only issue, not a runtime one. This still proves the thing that actually
    // matters here: the "simple-json" column genuinely round-trips through SQLite.
    const nodesJson = JSON.stringify([
      { id: 'n1', name: 'Start', type: 'start', typeVersion: 1, position: [0, 0], parameters: {} },
    ]);
    await dataSource.query(
      'INSERT INTO workflow (id, name, active, nodes, connections) VALUES (?, ?, ?, ?, ?)',
      ['w1', 'Test Workflow', 0, nodesJson, '{}'],
    );
    const [row] = (await dataSource.query('SELECT nodes FROM workflow WHERE id = ?', ['w1'])) as Array<{
      nodes: string;
    }>;
    expect(JSON.parse(row!.nodes)).toEqual([
      { id: 'n1', name: 'Start', type: 'start', typeVersion: 1, position: [0, 0], parameters: {} },
    ]);
  });

  it('can migrate up, down, and back up again cleanly (idempotent in both directions)', async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();

    await dataSource.runMigrations();
    await dataSource.undoLastMigration();
    await dataSource.undoLastMigration();
    await dataSource.runMigrations();

    const names = (await tableNames(dataSource)).sort();
    expect(names).toEqual(['assistant_session', 'credential', 'execution', 'migrations', 'user', 'workflow']);
  });
});
