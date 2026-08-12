import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { newCommand } from './new.js';

describe('newCommand', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects an invalid node name without writing anything', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'node-dev-new-'));
    const exitCode = await newCommand({ name: 'NotCamelCase', cwd: tmpDir });
    expect(exitCode).toBe(1);
    expect(existsSync(join(tmpDir, 'NotCamelCase'))).toBe(false);
  });

  it('writes a full scaffold to the given --dir, outside any monorepo', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'node-dev-new-'));
    const targetDir = join(tmpDir, 'my-node');

    const exitCode = await newCommand({ name: 'myApiNode', dir: targetDir, cwd: tmpDir });
    expect(exitCode).toBe(0);

    expect(existsSync(join(targetDir, 'package.json'))).toBe(true);
    expect(existsSync(join(targetDir, 'tsconfig.json'))).toBe(true);
    expect(existsSync(join(targetDir, 'src', 'MyApiNode.node.ts'))).toBe(true);
    expect(existsSync(join(targetDir, 'src', 'MyApiNode.node.test.ts'))).toBe(true);

    const pkg = JSON.parse(await readFile(join(targetDir, 'package.json'), 'utf8')) as { name: string };
    expect(pkg.name).toBe('myApiNode');
  });

  it('defaults the target directory to <monorepo root>/custom-nodes/<name> when run inside the monorepo', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'node-dev-new-'));
    // Simulate being inside a monorepo: a fake workspace root with a nested "cwd".
    const { writeFileSync, mkdirSync } = await import('node:fs');
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    const nestedCwd = join(tmpDir, 'packages', 'cli');
    mkdirSync(nestedCwd, { recursive: true });

    const exitCode = await newCommand({ name: 'myApiNode', cwd: nestedCwd });
    expect(exitCode).toBe(0);
    expect(existsSync(join(tmpDir, 'custom-nodes', 'myApiNode', 'package.json'))).toBe(true);
  });
});
