import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { IConnections, IDataObject, INode, INodeExecutionData, IWorkflowSettings } from '@n8n-clone/workflow';

/**
 * `simple-json` (TypeORM stores it as TEXT, JSON.stringify/parse in the driver layer) is used
 * for every structured column instead of a native `json`/`jsonb` type — Postgres and SQLite
 * disagree about JSON column types, and this sidesteps that dialect difference entirely
 * rather than needing separate handling per driver. `id` is likewise a plain varchar
 * populated with `randomUUID()` in application code rather than a DB-generated default —
 * see db/id.ts for why.
 */
@Entity({ name: 'workflow' })
export class WorkflowEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @Column({ type: 'boolean', default: false })
  active!: boolean;

  @Column({ type: 'simple-json' })
  nodes!: INode[];

  @Column({ type: 'simple-json' })
  connections!: IConnections;

  @Column({ type: 'simple-json', nullable: true })
  settings!: IWorkflowSettings | null;

  @Column({ type: 'simple-json', nullable: true })
  staticData!: IDataObject | null;

  @Column({ type: 'simple-json', nullable: true })
  pinData!: Record<string, INodeExecutionData[]> | null;

  @Column({ type: 'boolean', default: false })
  starred!: boolean;

  /** ISO timestamp when the workflow was moved to trash; null means it's live. Set by a soft delete, cleared by a restore, and purged for good after TRASH_RETENTION_DAYS. */
  @Column({ type: 'varchar', nullable: true })
  deletedAt!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  folderId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
