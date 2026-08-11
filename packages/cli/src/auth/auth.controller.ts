import { z } from 'zod';
import { Get, Post, RestController } from '../http/decorators.js';
import { hashPassword, verifyPassword } from './password.js';
import { signSessionToken } from './jwt.js';
import { SESSION_COOKIE_NAME } from './auth.middleware.js';
import type { AuthenticatedRequest } from './auth.middleware.js';
import { generateId } from '../db/id.js';
import { BadRequestError, ConflictError, UnauthorizedError } from '../http/http-errors.js';
import type { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import type { UserEntity } from '../db/entities/User.entity.js';

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8) });

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@RestController('/rest/auth')
export class AuthController {
  constructor(
    private readonly users: Repository<UserEntity>,
    private readonly jwtSecret: Uint8Array,
  ) {}

  /** Only succeeds once — before the first user exists. Creates the single owner account (see UserEntity's isOwner note: full multi-user RBAC is M12 scope). */
  @Post('/setup')
  async setup(req: Request, res: Response) {
    const existing = await this.users.count();
    if (existing > 0) throw new ConflictError('Setup has already been completed');

    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');

    const user = this.users.create({
      id: generateId(),
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
      isOwner: true,
    });
    await this.users.save(user);
    await this.issueSession(res, user);
    return { id: user.id, email: user.email };
  }

  @Post('/login')
  async login(req: Request, res: Response) {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) throw new BadRequestError(parsed.error.issues[0]?.message ?? 'Invalid request body');

    const user = await this.users.findOneBy({ email: parsed.data.email });
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      throw new UnauthorizedError('Invalid email or password');
    }
    await this.issueSession(res, user);
    return { id: user.id, email: user.email };
  }

  @Post('/logout')
  logout(_req: Request, res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(204).end();
  }

  @Get('/me')
  async me(req: Request) {
    const authedReq = req as Partial<AuthenticatedRequest>;
    if (!authedReq.user) throw new UnauthorizedError();
    const user = await this.users.findOneByOrFail({ id: authedReq.user.id });
    return { id: user.id, email: user.email, isOwner: user.isOwner };
  }

  private async issueSession(res: Response, user: UserEntity): Promise<void> {
    const token = await signSessionToken({ sub: user.id, email: user.email }, this.jwtSecret);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_MAX_AGE_MS,
    });
  }
}
