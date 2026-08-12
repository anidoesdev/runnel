import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Prefers the target package's own locally-installed `tsc` (present once `npm install` has run) and falls back to `npx tsc -b` when it isn't there yet. */
export async function buildCommand(dir: string): Promise<number> {
  const localTsc = join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
  const [command, args] = existsSync(localTsc) ? [localTsc, ['-b']] : ['npx', ['tsc', '-b']];

  return new Promise<number>((resolvePromise) => {
    const child = spawn(command, args, { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('error', (err) => {
      console.error(`Failed to run ${command}: ${err.message}`);
      resolvePromise(1);
    });
    child.on('exit', (code) => resolvePromise(code ?? 1));
  });
}
