import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkflowRepositoryAdapter } from './workflow-repository.adapter.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { IWorkflowBase, INode } from '@runnel/workflow';

/**
 * Raw SQL, not the repository API, for every write and read against the `workflow` table
 * itself here — same workaround db/migrations.sqlite.test.ts already documents: TypeORM's
 * generic FindOptionsWhere/QueryDeepPartialEntity types recurse excessively deep against
 * WorkflowEntity's nested structural types (INode[]/IConnections), which is a type-checker-only
 * problem, not a runtime one. WorkflowRepositoryAdapter itself is unaffected — it only ever
 * calls findOneBy/save, not insert, on the real entity.
 */
describe('WorkflowRepositoryAdapter', () => {
  let dataSource: DataSource;
  let workflows: Repository<WorkflowEntity>;
  let adapter: WorkflowRepositoryAdapter;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    workflows = dataSource.getRepository(WorkflowEntity);
    adapter = new WorkflowRepositoryAdapter(workflows);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const node: INode = { id: 'n1', name: 'Start', type: 'start', typeVersion: 1, position: [0, 0], parameters: {} };

  async function insertWorkflowRow(id: string, name: string, nodesJson: string, connectionsJson: string): Promise<void> {
    await dataSource.query('INSERT INTO workflow (id, name, active, nodes, connections) VALUES (?, ?, ?, ?, ?)', [
      id,
      name,
      0,
      nodesJson,
      connectionsJson,
    ]);
  }

  async function readWorkflowRow(id: string): Promise<{ name: string; nodes: string; connections: string }> {
    const [row] = (await dataSource.query('SELECT name, nodes, connections FROM workflow WHERE id = ?', [id])) as Array<{
      name: string;
      nodes: string;
      connections: string;
    }>;
    return row!;
  }

  it('get() returns the workflow as IWorkflowBase', async () => {
    await insertWorkflowRow('wf-1', 'Test', JSON.stringify([node]), '{}');

    const result = await adapter.get('wf-1');

    expect(result).toEqual({
      id: 'wf-1',
      name: 'Test',
      active: false,
      nodes: [node],
      connections: {},
      settings: undefined,
      staticData: undefined,
      pinData: undefined,
    });
  });

  it('get() throws NotFoundError for a missing workflow', async () => {
    await expect(adapter.get('nope')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('save() persists nodes/connections and returns the updated IWorkflowBase', async () => {
    await insertWorkflowRow('wf-1', 'Test', '[]', '{}');

    const updated: IWorkflowBase = {
      id: 'wf-1',
      name: 'Test',
      active: false,
      nodes: [node],
      connections: { Start: { main: [[]] } },
    };
    const result = await adapter.save('wf-1', updated);

    expect(result.nodes).toEqual([node]);
    const persisted = await readWorkflowRow('wf-1');
    expect(JSON.parse(persisted.nodes)).toEqual([node]);
    expect(JSON.parse(persisted.connections)).toEqual({ Start: { main: [[]] } });
  });

  it('save() does not touch the workflow\'s own name — only fields a draft can change', async () => {
    await insertWorkflowRow('wf-1', 'Original Name', '[]', '{}');

    await adapter.save('wf-1', { id: 'wf-1', name: 'Attempted Rename', active: false, nodes: [], connections: {} });

    const persisted = await readWorkflowRow('wf-1');
    expect(persisted.name).toBe('Original Name');
  });

  it('save() throws NotFoundError for a missing workflow', async () => {
    await expect(
      adapter.save('nope', { id: 'nope', name: 'x', active: false, nodes: [], connections: {} }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
