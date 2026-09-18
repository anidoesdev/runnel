import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * A flat, user-created grouping for workflows — the sidebar's "Folders" section. Flat rather
 * than a tree: the sidebar renders one level, and nesting would need reparenting rules and
 * cycle checks for no visible gain today. A workflow points at a folder through
 * `WorkflowEntity.folderId` (a plain varchar, not an FK — deleting a folder nulls the
 * pointer in application code, which SQLite and Postgres then behave identically about).
 */
@Entity({ name: 'folder' })
export class FolderEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  name!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
