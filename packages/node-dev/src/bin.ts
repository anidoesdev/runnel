#!/usr/bin/env node
import { resolve } from 'node:path';
import { newCommand } from './commands/new.js';
import { buildCommand } from './commands/build.js';

function readFlag(args: string[], flag: string): string | undefined {
  const arg = args.find((a) => a.startsWith(`${flag}=`));
  return arg?.slice(flag.length + 1);
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === 'new') {
    const name = rest.find((arg) => !arg.startsWith('--'));
    if (!name) {
      console.error('Usage: n8n-node-dev new <name> [--display-name="My Node"] [--dir=<path>]');
      process.exitCode = 1;
      return;
    }
    process.exitCode = await newCommand({
      name,
      displayName: readFlag(rest, '--display-name'),
      dir: readFlag(rest, '--dir'),
    });
    return;
  }

  if (command === 'build') {
    const dir = rest.find((arg) => !arg.startsWith('--')) ?? '.';
    process.exitCode = await buildCommand(resolve(process.cwd(), dir));
    return;
  }

  console.error('Usage: n8n-node-dev <new <name> | build [dir]>');
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
