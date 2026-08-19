import { Table } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Mirrors sqlite/1700000000001-AddAssistantSession.ts — see that file's note on why every column here is varchar/text regardless of dialect. */
export class AddAssistantSession1700000000001 implements MigrationInterface {
  name = 'AddAssistantSession1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'assistant_session',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'workflowId', type: 'varchar' },
          { name: 'draftId', type: 'varchar' },
          { name: 'messages', type: 'text' },
          { name: 'actor', type: 'text' },
          { name: 'tokenBudget', type: 'text' },
          { name: 'pendingApproval', type: 'text', isNullable: true },
          { name: 'pendingQuestions', type: 'text', isNullable: true },
          { name: 'status', type: 'varchar' },
          { name: 'createdAt', type: 'varchar' },
          { name: 'updatedAt', type: 'varchar' },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('assistant_session', true);
  }
}
