import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import type { ExecutionStatus, IRunExecutionData, WorkflowExecuteMode } from '@runnel/workflow';

@Entity({ name: 'execution' })
export class ExecutionEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  workflowId!: string;

  @Column({ type: 'varchar' })
  mode!: WorkflowExecuteMode;

  /** No native enum column type (Postgres has one, SQLite doesn't) — a plain varchar validated at the application boundary avoids that dialect split. */
  @Column({ type: 'varchar' })
  status!: ExecutionStatus;

  @CreateDateColumn()
  startedAt!: Date;

  /**
   * Stored as an ISO string rather than a native datetime/timestamp column. TypeORM can only
   * infer a per-dialect date column type from the property's reflected `Date` type when
   * `emitDecoratorMetadata` actually ran — true under `tsc` (the real build), but esbuild
   * (what vitest transpiles through) strips types without emitting that metadata, so the
   * same entity would behave differently under test than under the compiled build. A plain
   * varchar sidesteps that gap entirely, the same way `simple-json` sidesteps the JSON
   * column type split between dialects.
   */
  @Column({ type: 'varchar', nullable: true })
  stoppedAt!: string | null;

  /** The full IRunExecutionData — same shape the serialize-and-resume path uses, so a stored execution genuinely could be resumed from this column. */
  @Column({ type: 'simple-json' })
  data!: IRunExecutionData;
}
