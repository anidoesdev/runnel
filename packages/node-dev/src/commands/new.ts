import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { findMonorepoRoot, generateScaffoldFiles, validateNodeName } from '../scaffold.js';

export interface INewCommandOptions {
  name: string;
  displayName?: string;
  /** Defaults to <monorepo root>/custom-nodes/<name> when a monorepo is detected, otherwise ./<name>. */
  dir?: string;
  cwd?: string;
}

export async function newCommand(options: INewCommandOptions): Promise<number> {
  const { name, displayName } = options;
  const cwd = options.cwd ?? process.cwd();

  if (!validateNodeName(name)) {
    console.error(`Invalid node name "${name}" — must be camelCase, starting with a lowercase letter (e.g. "myApiNode").`);
    return 1;
  }

  const monorepoRoot = findMonorepoRoot(cwd);
  const targetDir = resolve(cwd, options.dir ?? (monorepoRoot ? join(monorepoRoot, 'custom-nodes', name) : name));

  const files = generateScaffoldFiles({ name, displayName, targetDir, monorepoRoot });

  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = join(targetDir, relativePath);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
  }

  console.log(`Created ${name} in ${targetDir}`);
  if (!monorepoRoot) {
    console.warn(
      'No runnel monorepo (pnpm-workspace.yaml) found above the target directory — ' +
        '"@runnel/workflow" was left as an unresolvable "*" dependency in package.json. ' +
        'Point it at a real install (e.g. a file: path to packages/workflow) before running `npm install`.',
    );
  } else {
    console.log(`Next steps:\n  cd ${targetDir}\n  npm install\n  npm run build`);
  }

  return 0;
}
