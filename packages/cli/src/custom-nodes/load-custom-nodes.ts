import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MapNodeTypes } from '@runnel/core';
import type { INodeType } from '@runnel/workflow';
import type { Logger } from 'pino';

function isNodeTypeShaped(value: unknown): value is INodeType {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<INodeType>;
  const description = candidate.description;
  if (!description || typeof description.name !== 'string' || !Array.isArray(description.properties)) return false;
  return (
    typeof candidate.execute === 'function' ||
    typeof candidate.trigger === 'function' ||
    typeof candidate.webhook === 'function' ||
    typeof candidate.poll === 'function'
  );
}

/** A scaffolded custom node package (see @runnel/node-dev) may export its node(s) as the default export, a named export, or several named exports — anything shaped like an INodeType counts, deduplicated in case default and a named export point at the same object. */
function extractNodeTypes(mod: Record<string, unknown>): INodeType[] {
  const candidates = new Set<unknown>(Object.values(mod));
  return [...candidates].filter(isNodeTypeShaped);
}

/**
 * Scans every immediate subdirectory of `dir` for a built package (`dist/index.js`, matching
 * what `runnel-node-dev new` scaffolds and `npm run build` produces) and dynamically imports it.
 * A subdirectory with no `dist/index.js` yet (not built) is silently skipped rather than
 * treated as an error — that's the normal state right after `runnel-node-dev new`, before the
 * user has run a build.
 */
export async function loadCustomNodeTypes(dir: string, logger: Logger): Promise<INodeType[]> {
  if (!existsSync(dir)) {
    logger.warn(`CUSTOM_NODES_DIR "${dir}" does not exist — no custom nodes loaded.`);
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const found: INodeType[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPoint = join(dir, entry.name, 'dist', 'index.js');
    if (!existsSync(entryPoint)) continue;

    try {
      const mod = (await import(pathToFileURL(entryPoint).href)) as Record<string, unknown>;
      const nodeTypes = extractNodeTypes(mod);
      if (nodeTypes.length === 0) {
        logger.warn(`${entryPoint} doesn't export anything that looks like an INodeType — skipped.`);
      }
      found.push(...nodeTypes);
    } catch (err) {
      logger.error({ err, entryPoint }, 'Failed to load custom node package');
    }
  }

  return found;
}

/** Built-in node types always win a name collision — a custom node can't silently shadow trusted built-in behavior. */
export function registerCustomNodeTypes(
  customNodeTypes: INodeType[],
  registry: MapNodeTypes,
  builtInNames: ReadonlySet<string>,
  logger: Logger,
): INodeType[] {
  const registered: INodeType[] = [];

  for (const nodeType of customNodeTypes) {
    if (builtInNames.has(nodeType.description.name)) {
      logger.warn(`Custom node "${nodeType.description.name}" collides with a built-in node type — the built-in wins.`);
      continue;
    }
    registry.register(nodeType);
    registered.push(nodeType);
  }

  return registered;
}
