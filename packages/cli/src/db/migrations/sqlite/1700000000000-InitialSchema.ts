import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'user',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'email', type: 'varchar', isUnique: true },
          { name: 'passwordHash', type: 'varchar' },
          { name: 'isOwner', type: 'boolean', default: false },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'workflow',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar' },
          { name: 'active', type: 'boolean', default: false },
          { name: 'nodes', type: 'text' },
          { name: 'connections', type: 'text' },
          { name: 'settings', type: 'text', isNullable: true },
          { name: 'staticData', type: 'text', isNullable: true },
          { name: 'pinData', type: 'text', isNullable: true },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'credential',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'name', type: 'varchar' },
          { name: 'type', type: 'varchar' },
          { name: 'data', type: 'text' },
          { name: 'createdAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'updatedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true,
    );

    await queryRunner.createTable(
      new Table({
        name: 'execution',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'workflowId', type: 'varchar' },
          { name: 'mode', type: 'varchar' },
          { name: 'status', type: 'varchar' },
          { name: 'startedAt', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
          { name: 'stoppedAt', type: 'datetime', isNullable: true },
          { name: 'data', type: 'text' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('execution', true);
    await queryRunner.dropTable('credential', true);
    await queryRunner.dropTable('workflow', true);
    await queryRunner.dropTable('user', true);
  }
}
