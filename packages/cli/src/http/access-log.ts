import { randomUUID } from 'node:crypto';
import { pinoHttp, stdSerializers } from 'pino-http';
import { redactSecrets } from '../logging/redact.js';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

/**
 * One structured log line per request (method, path, status, response time, a request id)
 * via pino-http, wrapping the *same* logger instance the rest of the app uses — so a
 * request's access-log line and any error/warn lines logged while handling it share the
 * same secret-redacting formatter (see logging/redact.ts).
 *
 * That formatter alone isn't enough here, though: pino calls `formatters.log` on the *raw*
 * log call arguments before pino-http's own req/res serializers run (verified empirically —
 * at that point `res` is still the live Node ServerResponse, not yet the plain
 * `{statusCode, headers}` object), so req/res never actually reach the formatter as plain
 * objects it could redact. redactSecrets deliberately leaves non-plain objects like the raw
 * ServerResponse untouched now (see redact.ts) so pino-http's own serializer still runs on
 * an intact object afterward — this explicit `req` serializer is what actually strips
 * sensitive headers (the session cookie, an Authorization header) once pino-http has turned
 * the raw request into a plain object.
 *
 * pino-std-serializers' own req/res objects aren't literally `Object.prototype` plain
 * objects (they're built via an internal constructor, presumably for V8 hidden-class
 * performance) — redactSecrets' opaque-passthrough guard would otherwise skip them too, the
 * same way it correctly skips the raw ServerResponse. A JSON round-trip normalizes it into a
 * genuinely plain, redactSecrets-recursable tree first.
 */
export function buildAccessLogMiddleware(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = typeof existing === 'string' ? existing : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    serializers: {
      req: (req) => redactSecrets(JSON.parse(JSON.stringify(stdSerializers.req(req))) as unknown),
    },
  });
}
