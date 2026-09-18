import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** A node type name must be valid both as a JS identifier fragment and as `INodeTypeDescription.name` (see index.ts's validateNodeName). */
export function validateNodeName(name: string): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(name);
}

export function toPascalCase(camelName: string): string {
  return camelName.charAt(0).toUpperCase() + camelName.slice(1);
}

export function toDisplayName(camelName: string): string {
  const spaced = camelName.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Windows path separators break both JSON string literals and tsconfig "extends" resolution if left as-is — package.json/tsconfig always want forward slashes regardless of platform. */
function toPosixPath(path: string): string {
  return path.split('\\').join('/');
}

/** Walks up from `startDir` looking for the pnpm workspace root — the scaffold depends on `@runnel/workflow` via a relative `file:` reference back into `packages/workflow`, which only makes sense once we know where that root is. */
export function findMonorepoRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export interface IScaffoldOptions {
  /** camelCase node type name, e.g. "myApiNode" — becomes INodeTypeDescription.name. */
  name: string;
  displayName?: string;
  /** Absolute path the package will be written to. */
  targetDir: string;
  /** Absolute path of the monorepo root, or null when scaffolding somewhere it can't be auto-detected. */
  monorepoRoot: string | null;
}

/**
 * Pure: given the scaffold options, returns every file the new node package needs as a
 * relative-path -> content map. Kept separate from actual disk writes (see commands/new.ts)
 * so the generation logic itself is trivially unit-testable.
 */
export function generateScaffoldFiles(options: IScaffoldOptions): Record<string, string> {
  const { name, targetDir, monorepoRoot } = options;
  const displayName = options.displayName ?? toDisplayName(name);
  const pascalName = toPascalCase(name);

  const workflowDependency = monorepoRoot
    ? `file:${toPosixPath(relative(targetDir, join(monorepoRoot, 'packages', 'workflow')))}`
    : '*';
  const tsconfigExtends = monorepoRoot
    ? toPosixPath(relative(targetDir, join(monorepoRoot, 'tsconfig.base.json')))
    : undefined;

  const packageJson = {
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    scripts: {
      build: 'tsc -b',
      test: 'vitest run',
    },
    dependencies: {
      '@runnel/workflow': workflowDependency,
    },
    devDependencies: {
      typescript: '^5.7.2',
      vitest: '^2.1.8',
      '@types/node': '^22.10.2',
    },
  };

  const tsconfig = tsconfigExtends
    ? {
        extends: tsconfigExtends,
        compilerOptions: { lib: ['ES2022'], types: ['node'], rootDir: 'src', outDir: 'dist', composite: false },
        include: ['src'],
      }
    : {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          declaration: true,
          esModuleInterop: true,
          skipLibCheck: true,
          lib: ['ES2022'],
          types: ['node'],
          rootDir: 'src',
          outDir: 'dist',
        },
        include: ['src'],
      };

  const nodeSource = `import type { IExecuteFunctions, INodeType, NodeOutput } from '@runnel/workflow';

/** Scaffolded by \`runnel-node-dev new ${name}\` — replace this with real logic. */
export const ${name}: INodeType = {
  description: {
    displayName: '${displayName}',
    name: '${name}',
    icon: 'fa:cube',
    group: ['transform'],
    version: 1,
    description: '${displayName} — a custom node',
    defaults: { name: '${displayName}' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      { displayName: 'Message', name: 'message', type: 'string', default: 'Hello from ${displayName}!' },
    ],
  },
  async execute(this: IExecuteFunctions): Promise<NodeOutput> {
    const items = this.getInputData();

    const output = items.map((item, i) => {
      const message = this.getNodeParameter('message', i, '') as string;
      return { json: { ...item.json, message }, pairedItem: { item: i } };
    });

    return [output];
  },
};

export default ${name};
`;

  const testSource = `import { describe, expect, it } from 'vitest';
import { ${name} } from './${pascalName}.node.js';
import type { IExecuteFunctions, INode, INodeExecutionData, NodeOutput } from '@runnel/workflow';

/**
 * A minimal hand-rolled IExecuteFunctions stand-in — real nodes-base tests reuse a shared
 * test harness from inside the runnel monorepo (which depends on @runnel/core), but a
 * standalone custom node package can't reach into that repo's src, so this stays self-contained.
 */
function makeContext(node: INode, items: INodeExecutionData[]): IExecuteFunctions {
  return {
    getInputData: () => items,
    getNodeParameter: (name, _itemIndex, fallback) => (node.parameters as Record<string, unknown>)[name] ?? fallback,
    getCredentials: async () => ({}),
    getNode: () => node,
    getWorkflow: () => ({ id: 'test', name: 'test', active: false }),
    continueOnFail: () => false,
    getContext: () => ({}),
    helpers: {
      httpRequest: async () => undefined,
      httpRequestWithAuthentication: async () => undefined,
      returnJsonArray: (jsonItems) => jsonItems.map((json) => ({ json })),
      constructExecutionMetaData: (metaItems, opts) => metaItems.map((item) => ({ ...item, pairedItem: opts.itemData })),
    },
  };
}

describe('${displayName}', () => {
  it('adds the configured message to every item', async () => {
    const node: INode = {
      id: '1',
      name: '${displayName}',
      type: '${name}',
      typeVersion: 1,
      position: [0, 0],
      parameters: { message: 'hi' },
    };
    const ctx = makeContext(node, [{ json: { a: 1 } }]);

    const result: NodeOutput = await ${name}.execute!.call(ctx);
    expect(result).toEqual([[{ json: { a: 1, message: 'hi' }, pairedItem: { item: 0 } }]]);
  });
});
`;

  const indexSource = `export { ${name} } from './${pascalName}.node.js';\n`;

  const readme = `# ${displayName}

A custom runnel node, scaffolded by \`runnel-node-dev new ${name}\`.

## Build

\`\`\`
npm install
npm run build
\`\`\`

## Load it into a running runnel server

Point \`CUSTOM_NODES_DIR\` at the parent directory containing this package (its \`dist/\` must
already be built) when starting the server:

\`\`\`
CUSTOM_NODES_DIR=/path/to/parent-dir runnel start
\`\`\`

The server scans every immediate subdirectory of \`CUSTOM_NODES_DIR\` for a built \`dist/index.js\`
and registers whatever node types it exports, alongside the built-in ones. A custom node whose
name collides with a built-in one is skipped (the built-in wins) and logged as a warning.
`;

  return {
    'package.json': `${JSON.stringify(packageJson, null, 2)}\n`,
    'tsconfig.json': `${JSON.stringify(tsconfig, null, 2)}\n`,
    'src/index.ts': indexSource,
    [`src/${pascalName}.node.ts`]: nodeSource,
    [`src/${pascalName}.node.test.ts`]: testSource,
    'README.md': readme,
  };
}
