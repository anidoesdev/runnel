import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/**
 * Walks up from `startDir` looking for the monorepo root (marked by `pnpm-workspace.yaml`) —
 * mirrors @n8n-clone/node-dev's own `findMonorepoRoot`. Duplicated rather than imported:
 * packages/cli can't depend on packages/node-dev (see .dependency-cruiser.cjs — node-dev only
 * depends on workflow, and nothing depends on node-dev), and this is eight lines.
 */
function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Loads a `.env` file from the monorepo root, if one is found — purely a local-development
 * convenience for `n8n-clone start`/`execute` run directly from a checkout. Real deployments
 * set environment variables directly (Docker Compose, systemd, ...) and this silently no-ops
 * for them, since there's no monorepo root to find inside a deployed container. Never
 * overrides an already-set variable (dotenv's default behavior) — an explicitly-exported env
 * var always wins over whatever `.env` has.
 */
export function loadEnvFile(scriptDir: string): void {
  const root = findMonorepoRoot(scriptDir);
  if (!root) return;

  const envPath = join(root, '.env');
  const result = loadDotenv({ path: envPath });
  if (!result.error && result.parsed) {
    console.log(`Loaded environment variables from ${envPath}`);
  }
}
