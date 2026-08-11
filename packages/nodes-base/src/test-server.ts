import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

export interface TestServer {
  url: string;
  server: Server;
  close: () => Promise<void>;
}

/** Spins up a real local HTTP server on an ephemeral port for testing the HTTP Request node against actual network behavior — matching the M5 DoD's "offline, against a mock HTTP server". */
export function startTestServer(handler: Handler): Promise<TestServer> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        server,
        close: () => new Promise((closeResolve) => server.close(() => closeResolve())),
      });
    });
  });
}

export function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
    });
    req.on('end', () => resolve(data));
  });
}
