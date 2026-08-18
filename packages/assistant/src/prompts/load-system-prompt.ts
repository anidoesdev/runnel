import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SYSTEM_PROMPT_PATH = fileURLToPath(new URL('./system.md', import.meta.url));

/**
 * system.md is source code (see its own header) — reviewed in PRs, versioned, never edited
 * without an eval run. Loaded once per process rather than per turn since prompt content
 * doesn't change mid-run; the build script copies it next to the compiled loader (see
 * package.json's build script) so this same relative path resolves whether running from
 * src/ (ts-node/vitest) or dist/ (the real process).
 */
export const SYSTEM_PROMPT = readFileSync(SYSTEM_PROMPT_PATH, 'utf-8');
