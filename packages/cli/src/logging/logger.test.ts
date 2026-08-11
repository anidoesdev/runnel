import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function captureStream(): { stream: Writable; output: () => string } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, output: () => chunks.join('') };
}

describe('createLogger — redaction', () => {
  it('never writes a known secret to the log output', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ destination: stream });

    logger.info({ user: { email: 'a@example.com', password: 'super-secret-value' } }, 'user logged in');

    expect(output()).not.toContain('super-secret-value');
    expect(output()).toContain('[Redacted]');
    expect(output()).toContain('a@example.com');
  });

  it('redacts credential data nested inside an error object', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ destination: stream });

    logger.error({ credential: { name: 'My API', apiKey: 'sk-do-not-leak-me' } }, 'request failed');

    expect(output()).not.toContain('sk-do-not-leak-me');
  });

  it('still logs non-sensitive fields normally', () => {
    const { stream, output } = captureStream();
    const logger = createLogger({ destination: stream });

    logger.info({ workflowId: 'wf-1', itemCount: 3 }, 'execution finished');
    const parsed = JSON.parse(output()) as { workflowId: string; itemCount: number; msg: string };

    expect(parsed.workflowId).toBe('wf-1');
    expect(parsed.itemCount).toBe(3);
    expect(parsed.msg).toBe('execution finished');
  });
});
