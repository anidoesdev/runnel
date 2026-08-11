import pino from 'pino';
import { redactSecrets } from './redact.js';
import type { Logger, LoggerOptions } from 'pino';

export interface ICreateLoggerOptions {
  level?: string;
  /** For tests — pino writes newline-delimited JSON to this stream instead of stdout. */
  destination?: NodeJS.WritableStream;
}

export function createLogger(options: ICreateLoggerOptions = {}): Logger {
  const pinoOptions: LoggerOptions = {
    level: options.level ?? 'info',
    formatters: {
      log(object) {
        return redactSecrets(object) as Record<string, unknown>;
      },
    },
  };

  if (options.destination) {
    return pino(pinoOptions, options.destination);
  }
  return pino(pinoOptions);
}
