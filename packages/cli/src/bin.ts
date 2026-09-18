#!/usr/bin/env node
import 'reflect-metadata';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './env-file.js';
import { startCommand } from './commands/start.js';
import { executeCommand } from './commands/execute.js';

// Must run before config.js reads process.env (inside startCommand/executeCommand below).
loadEnvFile(dirname(fileURLToPath(import.meta.url)));

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === 'start') {
    await startCommand();
    return;
  }

  if (command === 'execute') {
    const idArg = rest.find((arg) => arg.startsWith('--id='));
    const id = idArg?.slice('--id='.length);
    if (!id) {
      console.error('Usage: runnel execute --id=<workflowId>');
      process.exitCode = 1;
      return;
    }
    process.exitCode = await executeCommand(id);
    return;
  }

  console.error('Usage: runnel <start|execute --id=<workflowId>>');
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
