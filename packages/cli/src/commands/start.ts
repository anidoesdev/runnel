import { startServer } from '../server.js';

/** `n8n-clone start`: boots the Express server and keeps running until SIGINT/SIGTERM. */
export async function startCommand(): Promise<void> {
  await startServer();
}
