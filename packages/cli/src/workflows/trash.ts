import { LessThan, Not, IsNull } from 'typeorm';
import type { Repository } from 'typeorm';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';

/** How long a soft-deleted workflow stays restorable before it is destroyed for good. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Destroys trashed workflows past the retention window. Called at startup and whenever the
 * trash is listed, rather than on a timer: a long-lived server and a laptop that runs Runnel
 * for ten minutes a day then both purge, and there is no scheduler to keep alive. Deleting a
 * handful of rows by an indexed-enough predicate is cheap enough to do on a list request.
 */
export async function purgeExpiredTrash(
  workflows: Repository<WorkflowEntity>,
  now: Date = new Date(),
  retentionDays: number = TRASH_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const { affected } = await workflows.delete({ deletedAt: LessThan(cutoff) });
  return affected ?? 0;
}

export const TRASHED = { deletedAt: Not(IsNull()) };
export const NOT_TRASHED = { deletedAt: IsNull() };
