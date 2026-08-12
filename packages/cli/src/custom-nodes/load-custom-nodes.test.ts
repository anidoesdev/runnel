import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MapNodeTypes } from '@n8n-clone/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCustomNodeTypes, registerCustomNodeTypes } from './load-custom-nodes.js';
import type { Logger } from 'pino';

function makeLogger(): Logger {
  return { warn: vi.fn(), error: vi.fn(), info: vi.fn() } as unknown as Logger;
}

/** Writes a minimal, real, already-"built" custom node package — a plain .js module, no
 * compilation needed — at <dir>/<packageName>/dist/index.js, matching what `n8n-node-dev new`
 * + `npm run build` would actually produce. */
function writeBuiltPackage(dir: string, packageName: string, source: string): void {
  const distDir = join(dir, packageName, 'dist');
  mkdirSync(distDir, { recursive: true });
  writeFileSync(join(distDir, 'index.js'), source, 'utf8');
}

const validNodeSource = `
export const myNode = {
  description: { name: 'myCustomNode', properties: [] },
  async execute() { return [[]]; },
};
export default myNode;
`;

describe('loadCustomNodeTypes', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('warns and returns an empty list when the directory does not exist', async () => {
    const logger = makeLogger();
    const result = await loadCustomNodeTypes(join(tmpdir(), 'does-not-exist-' + Date.now()), logger);
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('does not exist'));
  });

  it('loads a real built custom node package and extracts its INodeType export', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-nodes-'));
    writeBuiltPackage(tmpDir, 'my-node', validNodeSource);

    const logger = makeLogger();
    const result = await loadCustomNodeTypes(tmpDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.description.name).toBe('myCustomNode');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('deduplicates when the default export and a named export are the same object', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-nodes-'));
    writeBuiltPackage(tmpDir, 'my-node', validNodeSource);

    const result = await loadCustomNodeTypes(tmpDir, makeLogger());
    expect(result).toHaveLength(1);
  });

  it('skips a subdirectory that has not been built yet (no dist/index.js)', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-nodes-'));
    mkdirSync(join(tmpDir, 'unbuilt-node', 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'unbuilt-node', 'src', 'index.ts'), '// not built', 'utf8');

    const result = await loadCustomNodeTypes(tmpDir, makeLogger());
    expect(result).toEqual([]);
  });

  it('warns and skips a built module that exports nothing INodeType-shaped', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-nodes-'));
    writeBuiltPackage(tmpDir, 'not-a-node', 'export const somethingElse = 42;\n');

    const logger = makeLogger();
    const result = await loadCustomNodeTypes(tmpDir, logger);

    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("doesn't export anything"));
  });

  it('logs and continues past a package whose module throws on import', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'custom-nodes-'));
    writeBuiltPackage(tmpDir, 'broken-node', "throw new Error('boom');\n");
    writeBuiltPackage(tmpDir, 'good-node', validNodeSource);

    const logger = makeLogger();
    const result = await loadCustomNodeTypes(tmpDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.description.name).toBe('myCustomNode');
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('registerCustomNodeTypes', () => {
  it('registers a custom node type that does not collide with a built-in name', () => {
    const registry = new MapNodeTypes();
    const customNode = { description: { name: 'myCustomNode', properties: [] }, execute: async () => [[]] } as never;

    const registered = registerCustomNodeTypes([customNode], registry, new Set(['httpRequest']), makeLogger());

    expect(registered).toEqual([customNode]);
    expect(registry.getByNameAndVersion('myCustomNode')).toBe(customNode);
  });

  it('skips and warns on a name collision with a built-in node, which is never registered over', () => {
    const registry = new MapNodeTypes();
    const builtIn = { description: { name: 'httpRequest', properties: [] }, execute: async () => [[]] } as never;
    registry.register(builtIn);
    const colliding = { description: { name: 'httpRequest', properties: [] }, execute: async () => [[]] } as never;

    const logger = makeLogger();
    const registered = registerCustomNodeTypes([colliding], registry, new Set(['httpRequest']), logger);

    expect(registered).toEqual([]);
    expect(registry.getByNameAndVersion('httpRequest')).toBe(builtIn);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('collides'));
  });
});
