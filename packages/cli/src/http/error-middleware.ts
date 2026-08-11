import { ZodError } from 'zod';
import { HttpError } from './http-errors.js';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';

/** Must be registered last. Express recognizes an error middleware by its 4-argument arity. */
export function buildErrorMiddleware(logger: Logger) {
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.issues });
      return;
    }
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ error: 'Internal server error' });
  };
}
