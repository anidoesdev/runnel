import { IsNull } from 'typeorm';
import { generateId } from '../db/id.js';
import type { Repository } from 'typeorm';
import type { NotificationEntity, NotificationType } from '../db/entities/Notification.entity.js';

/** Most recent first; the bell shows a page of these, not the whole history. */
export const NOTIFICATION_PAGE_SIZE = 50;

export interface INotificationFeed {
  items: NotificationEntity[];
  unreadCount: number;
}

/**
 * Writes and reads the bell menu's feed.
 *
 * Only *unattended* execution failures are recorded — triggers, polls and webhooks, which fail
 * while nobody is looking. A manual run's failure is already on screen in the execution panel
 * the moment it happens, so notifying about it would just duplicate what the user is looking at.
 */
export class NotificationService {
  constructor(private readonly notifications: Repository<NotificationEntity>) {}

  async record(
    type: NotificationType,
    workflow: { id: string; name: string },
    message: string,
    executionId?: string,
  ): Promise<NotificationEntity> {
    const entity = this.notifications.create({
      id: generateId(),
      type,
      workflowId: workflow.id,
      workflowName: workflow.name,
      executionId: executionId ?? null,
      message,
      createdAt: new Date().toISOString(),
      readAt: null,
    });
    return this.notifications.save(entity);
  }

  async recordExecutionFailed(workflow: { id: string; name: string }, executionId: string, error?: string): Promise<void> {
    const detail = error?.trim() ? `: ${error.trim()}` : '';
    await this.record('execution_failed', workflow, `Execution failed${detail}`, executionId);
  }

  async recordActivationChanged(workflow: { id: string; name: string }, active: boolean): Promise<void> {
    await this.record(
      active ? 'workflow_activated' : 'workflow_deactivated',
      workflow,
      active ? 'Workflow activated' : 'Workflow deactivated',
    );
  }

  async feed(limit = NOTIFICATION_PAGE_SIZE): Promise<INotificationFeed> {
    const [items, unreadCount] = await Promise.all([
      this.notifications.find({ order: { createdAt: 'DESC' }, take: limit }),
      this.notifications.count({ where: { readAt: IsNull() } }),
    ]);
    return { items, unreadCount };
  }

  async markAllRead(): Promise<void> {
    await this.notifications.update({ readAt: IsNull() }, { readAt: new Date().toISOString() });
  }

  async clear(): Promise<void> {
    await this.notifications.clear();
  }
}
