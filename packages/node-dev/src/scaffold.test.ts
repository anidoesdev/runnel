import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findMonorepoRoot, generateScaffoldFiles, toDisplayName, toPascalCase, validateNodeName } from './scaffold.js';

describe('validateNodeName', () => {
  it('accepts camelCase names', () => {
    expect(validateNodeName('myApiNode')).toBe(true);
  });

  it('rejects capitalized, spaced, or empty names', () => {
    expect(validateNodeName('MyApiNode')).toBe(false);
    expect(validateNodeName('my api node')).toBe(false);
    expect(validateNodeName('')).toBe(false);
  });
});

describe('toPascalCase / toDisplayName', () => {
  it('capitalizes the first letter for PascalCase', () => {
    expect(toPascalCase('myApiNode')).toBe('MyApiNode');
  });

  it('splits camelCase words and capitalizes for a display name', () => {
    expect(toDisplayName('myApiNode')).toBe('My Api Node');
    expect(toDisplayName('http2Client')).toBe('Http2 Client');
  });
});

describe('findMonorepoRoot', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no pnpm-workspace.yaml is found up the tree', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'node-dev-test-'));
    expect(findMonorepoRoot(tmpDir)).toBeNull();
  });

  it('finds the workspace root from a nested subdirectory', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'node-dev-test-'));
    writeFileSync(join(tmpDir, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
    const nested = join(tmpDir, 'a', 'b', 'c');
    expect(findMonorepoRoot(nested)).toBe(tmpDir);
  });
});

describe('generateScaffoldFiles', () => {
  it('produces a package.json with a file: dependency on @n8n-clone/workflow when a monorepo root is given', () => {
    const files = generateScaffoldFiles({
      name: 'myApiNode',
      targetDir: '/repo/custom-nodes/myApiNode',
      monorepoRoot: '/repo',
    });

    const pkg = JSON.parse(files['package.json']!) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@n8n-clone/workflow']).toBe('file:../../packages/workflow');
  });

  it('falls back to an unresolvable "*" dependency with no monorepo root', () => {
    const files = generateScaffoldFiles({ name: 'myApiNode', targetDir: '/somewhere/myApiNode', monorepoRoot: null });
    const pkg = JSON.parse(files['package.json']!) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@n8n-clone/workflow']).toBe('*');
  });

  it('emits a node file, a test file, an index re-export, and a tsconfig, named after the node', () => {
    const files = generateScaffoldFiles({ name: 'myApiNode', targetDir: '/repo/custom-nodes/myApiNode', monorepoRoot: '/repo' });

    expect(Object.keys(files).sort()).toEqual(
      ['package.json', 'tsconfig.json', 'src/index.ts', 'src/MyApiNode.node.ts', 'src/MyApiNode.node.test.ts', 'README.md'].sort(),
    );
    expect(files['src/index.ts']).toContain("export { myApiNode } from './MyApiNode.node.js';");
  });

  it('the generated node source declares an INodeType with the given name and a default display name', () => {
    const files = generateScaffoldFiles({ name: 'myApiNode', targetDir: '/repo/custom-nodes/myApiNode', monorepoRoot: '/repo' });
    const source = files['src/MyApiNode.node.ts']!;
    expect(source).toContain("name: 'myApiNode'");
    expect(source).toContain("displayName: 'My Api Node'");
    expect(source).toContain('export const myApiNode: INodeType');
  });

  it('honors an explicit displayName override', () => {
    const files = generateScaffoldFiles({
      name: 'myApiNode',
      displayName: 'My Custom Thing',
      targetDir: '/repo/custom-nodes/myApiNode',
      monorepoRoot: '/repo',
    });
    expect(files['src/MyApiNode.node.ts']).toContain("displayName: 'My Custom Thing'");
  });

  it('tsconfig extends the monorepo tsconfig.base.json by relative path when a root is known', () => {
    const files = generateScaffoldFiles({ name: 'myApiNode', targetDir: '/repo/custom-nodes/myApiNode', monorepoRoot: '/repo' });
    const tsconfig = JSON.parse(files['tsconfig.json']!) as { extends?: string };
    expect(tsconfig.extends).toBe('../../tsconfig.base.json');
  });

  it('tsconfig is self-contained (no extends) with no monorepo root', () => {
    const files = generateScaffoldFiles({ name: 'myApiNode', targetDir: '/somewhere/myApiNode', monorepoRoot: null });
    const tsconfig = JSON.parse(files['tsconfig.json']!) as { extends?: string; compilerOptions: { strict?: boolean } };
    expect(tsconfig.extends).toBeUndefined();
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });
});
