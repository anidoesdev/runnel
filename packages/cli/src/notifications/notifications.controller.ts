import { Delete, Get, Post, RestController } from '../http/decorators.js';
import type { Request, Response } from 'express';
import type { NotificationService } from './notification.service.js';

@RestController('/rest/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  /** The bell's whole state in one request: the visible page plus the badge count. */
  @Get('/')
  async feed() {
    return this.notifications.feed();
  }

  @Post('/read')
  async markAllRead(_req: Request, res: Response) {
    await this.notifications.markAllRead();
    res.status(204).end();
  }

  @Delete('/')
  async clear(_req: Request, res: Response) {
    await this.notifications.clear();
    res.status(204).end();
  }
}
