import { startServer } from '../server.js';

/** `runnel start`: boots the Express server and keeps running until SIGINT/SIGTERM. */
export async function startCommand(): Promise<void> {
  await startServer();
}
