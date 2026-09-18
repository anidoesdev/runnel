import { z } from 'zod';
import { Get, Patch, RestController } from '../http/decorators.js';
import { UnauthorizedError } from '../http/http-errors.js';
import type { Request } from 'express';
import type { Repository } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/auth.middleware.js';
import type { IUserSettings, UserEntity } from '../db/entities/User.entity.js';

/** What the settings page reports about the server it is talking to. Read-only, and deliberately free of anything secret: paths and flags, never keys. */
export interface ISystemInfo {
  version: string;
  nodeVersion: string;
  database: 'sqlite' | 'postgres';
  customNodesDir: string | null;
  memory: { capture: boolean; recall: boolean; tokenBudget: number };
}

const preferencesSchema = z.object({
  assistant: z
    .object({
      // The floor keeps a session usable; the ceiling is the server's own default limit.
      tokenLimit: z.number().int().min(1_000).max(1_000_000).optional(),
    })
    .optional(),
});

@RestController('/rest/settings')
export class SettingsController {
  constructor(
    private readonly users: Repository<UserEntity>,
    private readonly systemInfo: ISystemInfo,
  ) {}

  @Get('/system')
  system(): ISystemInfo {
    return this.systemInfo;
  }

  @Get('/preferences')
  async getPreferences(req: Request): Promise<IUserSettings> {
    const user = await this.currentUser(req);
    return user.settings ?? {};
  }

  /** A shallow merge per section: sending `{ assistant: { tokenLimit } }` leaves every other section alone. */
  @Patch('/preferences')
  async updatePreferences(req: Request): Promise<IUserSettings> {
    const parsed = preferencesSchema.parse(req.body);
    const user = await this.currentUser(req);
    const settings: IUserSettings = {
      ...(user.settings ?? {}),
      ...(parsed.assistant ? { assistant: { ...(user.settings?.assistant ?? {}), ...parsed.assistant } } : {}),
    };
    user.settings = settings;
    await this.users.save(user);
    return settings;
  }

  private async currentUser(req: Request): Promise<UserEntity> {
    const id = (req as Partial<AuthenticatedRequest>).user?.id;
    if (!id) throw new UnauthorizedError();
    return this.users.findOneByOrFail({ id });
  }
}
