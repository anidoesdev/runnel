/**
 * Enforces the strict downward dependency direction between packages described
 * in docs/architecture.md:
 *   workflow  -> (nothing internal)
 *   core      -> workflow
 *   nodes-base-> workflow, core
 *   cli       -> workflow, core, nodes-base
 *   design-system -> (nothing internal)
 *   editor-ui -> workflow, design-system
 *   node-dev  -> workflow
 */
const pkg = (name) => `^packages/${name}/src`;

module.exports = {
  forbidden: [
    {
      name: 'workflow-no-internal-deps',
      severity: 'error',
      comment: 'packages/workflow must be a pure, dependency-light domain core with no internal deps.',
      from: { path: pkg('workflow') },
      to: {
        path: '^packages/(core|nodes-base|cli|design-system|editor-ui|node-dev)/src',
      },
    },
    {
      name: 'workflow-no-nodejs-io',
      severity: 'error',
      comment: 'packages/workflow must be importable by the browser: no Node.js built-ins.',
      from: { path: pkg('workflow') },
      to: { path: '^(node:|fs$|fs/|path$|http$|https$|crypto$|child_process$|net$|os$)' },
    },
    {
      name: 'core-only-depends-on-workflow',
      severity: 'error',
      from: { path: pkg('core') },
      to: { path: '^packages/(nodes-base|cli|design-system|editor-ui|node-dev)/src' },
    },
    {
      name: 'nodes-base-only-depends-on-workflow-and-core',
      severity: 'error',
      from: { path: pkg('nodes-base') },
      to: { path: '^packages/(cli|design-system|editor-ui|node-dev)/src' },
    },
    {
      name: 'design-system-no-internal-deps',
      severity: 'error',
      comment: 'design-system is pure Vue primitives — no dependency on workflow/core/cli.',
      from: { path: pkg('design-system') },
      to: { path: '^packages/(workflow|core|nodes-base|cli|editor-ui|node-dev)/src' },
    },
    {
      name: 'editor-ui-only-depends-on-workflow-and-design-system',
      severity: 'error',
      from: { path: pkg('editor-ui') },
      to: { path: '^packages/(core|nodes-base|cli|node-dev)/src' },
    },
    {
      name: 'node-dev-only-depends-on-workflow',
      severity: 'error',
      from: { path: pkg('node-dev') },
      to: { path: '^packages/(core|nodes-base|cli|design-system|editor-ui)/src' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
