import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';

/**
 * Guards the auth endpoints against credential-stuffing/brute-force and setup-spam — the two
 * routes that are reachable with no session at all (see auth.middleware.ts's PUBLIC_PATHS).
 * Keyed by IP by default (express-rate-limit's standard behavior), which is the right unit
 * for "how many login attempts is one caller allowed" regardless of which email they're
 * trying. 429 with a plain JSON body matches this project's other error responses.
 */
export function buildAuthRateLimiter(options: { windowMs?: number; max?: number } = {}): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    limit: options.max ?? 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many requests — try again later.' },
  });
}
