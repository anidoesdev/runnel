import { Table, TableColumn } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The library features behind the editor's formerly-disabled controls: starring, a trash that
 * delete now writes to instead of destroying a row, user-created folders, and the notification
 * feed. `deletedAt`/`createdAt`/`readAt` are ISO varchars rather than datetime columns, same
 * reasoning as ExecutionEntity.stoppedAt and AssistantSessionEntity — the value is produced in
 * application code, so a DB-managed column would be a second source of truth.
 */
export class AddWorkflowLibrary1700000000002 implements MigrationInterface {
  name = 'AddWorkflowLibrary1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('workflow', [
      new TableColumn({ name: 'starred', type: 'boolean', default: false }),
      new TableColumn({ name: 'deletedAt', type: 'varchar', isNullable: true }),
      new TableColumn({ name: 'folderId', type: 'varchar', length: '36', isNullable: true }),
    ]);

    await queryRunner.addColumn(
      'user',
      new TableColumn({ name: 'settings', type: 'text', isNullable: true }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'folder',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'notification',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'type', type: 'varchar' },
          { name: 'workflowId', type: 'varchar', length: '36', isNullable: true },
          { name: 'workflowName', type: 'varchar' },
          { name: 'executionId', type: 'varchar', length: '36', isNullable: true },
          { name: 'message', type: 'varchar' },
          { name: 'createdAt', type: 'varchar' },
          { name: 'readAt', type: 'varchar', isNullable: true },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notification', true);
    await queryRunner.dropTable('folder', true);
    await queryRunner.dropColumn('user', 'settings');
    await queryRunner.dropColumns('workflow', ['starred', 'deletedAt', 'folderId']);
  }
}
