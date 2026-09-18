import { Column, Entity, PrimaryColumn } from 'typeorm';

export type NotificationType = 'execution_failed' | 'workflow_activated' | 'workflow_deactivated';

/**
 * The bell menu's feed. Written at the moment something notable happens rather than derived by
 * querying executions: an activation leaves no row anywhere else, and a feed that mixes "rows I
 * can mark read" with "rows I can't" has no honest unread count. `workflowName` is copied in on
 * purpose — a notification still has to read correctly after its workflow is renamed or deleted.
 */
@Entity({ name: 'notification' })
export class NotificationEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  type!: NotificationType;

  @Column({ type: 'varchar', length: 36, nullable: true })
  workflowId!: string | null;

  @Column({ type: 'varchar' })
  workflowName!: string;

  @Column({ type: 'varchar', length: 36, nullable: true })
  executionId!: string | null;

  @Column({ type: 'varchar' })
  message!: string;

  @Column({ type: 'varchar' })
  createdAt!: string;

  @Column({ type: 'varchar', nullable: true })
  readAt!: string | null;
}
