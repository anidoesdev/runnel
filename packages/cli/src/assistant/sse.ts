import type { Response } from 'express';

/** Opens a text/event-stream response — the server-side counterpart to packages/assistant's own SSE *parser* (which reads OpenAI's stream; this writes one to the browser). `X-Accel-Buffering: no` and `no-transform` matter for the same reason they always do with SSE: a buffering proxy in front of the app would otherwise hold the whole response until it closes, defeating streaming entirely. */
export function startSseResponse(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
}

export function writeSseEvent(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
