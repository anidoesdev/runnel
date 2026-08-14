import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './env-file.js';

const TEST_KEY = 'N8N_CLONE_ENV_FILE_TEST_VAR';
const OTHER_KEY = 'N8N_CLONE_ENV_FILE_TEST_ALREADY_SET';

describe('loadEnvFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    delete process.env[TEST_KEY];
    delete process.env[OTHER_KEY];
  });

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    delete process.env[TEST_KEY];
    delete process.env[OTHER_KEY];
  });

  it('does nothing when no monorepo root (pnpm-workspace.yaml) is found above the given directory', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'env-file-test-'));
    loadEnvFile(tmpDir);
    expect(process.env[TEST_KEY]).toBeUndefined();
  });

  it('loads variables from .env at the monorepo root into process.env', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'env-file-test-'));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    writeFileSync(join(tmpDir, '.env'), `${TEST_KEY}=from-dotenv\n`);

    const nestedScriptDir = join(tmpDir, 'packages', 'cli', 'dist');
    mkdirSync(nestedScriptDir, { recursive: true });

    loadEnvFile(nestedScriptDir);
    expect(process.env[TEST_KEY]).toBe('from-dotenv');
  });

  it('never overrides a variable that is already set in the environment', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'env-file-test-'));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    writeFileSync(join(tmpDir, '.env'), `${OTHER_KEY}=from-dotenv\n`);
    process.env[OTHER_KEY] = 'from-real-environment';

    loadEnvFile(tmpDir);
    expect(process.env[OTHER_KEY]).toBe('from-real-environment');
  });

  it('does nothing when a monorepo root is found but it has no .env file', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'env-file-test-'));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');

    loadEnvFile(tmpDir);
    expect(process.env[TEST_KEY]).toBeUndefined();
  });
});
