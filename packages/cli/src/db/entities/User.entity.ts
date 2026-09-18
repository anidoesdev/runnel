import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export interface IUserSettings {
  assistant?: {
    /** Token budget a new assistant session starts with (see AssistantController's DEFAULT_TOKEN_LIMIT). */
    tokenLimit?: number;
  };
}

/** `id` is a plain varchar primary key populated with `randomUUID()` in application code (see db/id.ts) — not a DB-generated UUID default, which would need Postgres's pgcrypto/uuid-ossp extension enabled and has no SQLite equivalent at all. */
@Entity({ name: 'user' })
export class UserEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar' })
  passwordHash!: string;

  /** Single-owner bootstrap model for M6 — projects/RBAC/multi-user roles are M12 scope. */
  @Column({ type: 'boolean', default: false })
  isOwner!: boolean;

  /** Per-user preferences set from the settings page (assistant defaults today). Appearance is deliberately not here — a theme is per-browser, so the editor keeps it in localStorage. */
  @Column({ type: 'simple-json', nullable: true })
  settings!: IUserSettings | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
