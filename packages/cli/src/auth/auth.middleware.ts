import { verifySessionToken } from './jwt.js';
import { UnauthorizedError } from '../http/http-errors.js';
import type { NextFunction, Request, Response } from 'express';

export const SESSION_COOKIE_NAME = 'runnel-auth';

export interface IAuthenticatedUser {
  id: string;
  email: string;
}

/**
 * A Request that has been through requireAuth. Rather than globally augmenting Express's
 * ambient Request type (fragile here — the workspace has both express 4 and 5 types present
 * as transitive deps of different packages, and the augmentation target module differs
 * between them), callers that need `.user` accept this type explicitly.
 */
export type AuthenticatedRequest = Request & { user: IAuthenticatedUser };

/**
 * Verifies the session cookie and attaches `req.user`; rejects with 401 otherwise. Mounted
 * globally (not per-router), with an explicit allowlist of paths that must stay reachable
 * without a session — auth/setup and auth/login are how you *get* a session in the first
 * place, healthz needs to answer before there's any concept of a logged-in caller, and
 * webhook URLs are called by external systems that were never going to have a session cookie
 * at all. `publicPathPrefixes` exists only for webhooks, whose paths are registered at
 * runtime and can't live in a fixed Set. Deciding this by an allowlist here, rather than by
 * which routers get mounted before vs. after the middleware, means there's exactly one place
 * that says what's public — Express route-registration order is not a security boundary you
 * want to have to reason about.
 */
export function requireAuth(
  jwtSecret: Uint8Array,
  publicPaths: ReadonlySet<string> = new Set(),
  publicPathPrefixes: readonly string[] = [],
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (publicPaths.has(req.path) || publicPathPrefixes.some((prefix) => req.path.startsWith(prefix))) {
      next();
      return;
    }

    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE_NAME];
    if (!token) {
      next(new UnauthorizedError('Not authenticated'));
      return;
    }
    try {
      const payload = await verifySessionToken(token, jwtSecret);
      (req as AuthenticatedRequest).user = { id: payload.sub, email: payload.email };
      next();
    } catch {
      next(new UnauthorizedError('Invalid or expired session'));
    }
  };
}
