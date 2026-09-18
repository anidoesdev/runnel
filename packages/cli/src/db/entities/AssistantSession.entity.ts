import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { IModelMessage } from '@runnel/assistant';

/**
 * Mirrors IAssistantSession almost field-for-field — the repository adapter (see
 * packages/cli/src/assistant/assistant-session.repository.ts) is a thin mapping, not a
 * transformation. `createdAt`/`updatedAt` are plain varchar ISO strings rather than
 * TypeORM-managed date columns, same reasoning as ExecutionEntity.stoppedAt: the domain object
 * already computes them itself (see agent-loop.ts's `finalize`), and a DB-managed column would
 * just be a second, competing source of truth for the same value.
 */
@Entity({ name: 'assistant_session' })
export class AssistantSessionEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  workflowId!: string;

  @Column({ type: 'varchar' })
  draftId!: string;

  @Column({ type: 'simple-json' })
  messages!: IModelMessage[];

  @Column({ type: 'simple-json' })
  actor!: { userId: string; projectId?: string; scopes: string[] };

  @Column({ type: 'simple-json' })
  tokenBudget!: { used: number; limit: number };

  @Column({ type: 'simple-json', nullable: true })
  pendingApproval!: { toolCallId: string; toolName: string; args: unknown; remainingCalls: unknown[] } | null;

  @Column({ type: 'simple-json', nullable: true })
  pendingQuestions!: { toolCallId: string; questions: unknown[]; remainingCalls: unknown[] } | null;

  @Column({ type: 'varchar' })
  status!: string;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar' })
  updatedAt!: string;
}
