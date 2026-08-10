import { DateTime } from 'luxon';
import { ExpressionError } from '../interfaces/errors.js';
import { jmespathLite } from './jmespath-lite.js';
import type { IDataObject, INodeExecutionData } from '../interfaces/common.interfaces.js';
import type { IExpressionEvalContext, IExpressionScopeDefinition } from '../interfaces/expression.interfaces.js';

interface INodeAccessor {
  item: INodeExecutionData | undefined;
  json: IDataObject;
  first: () => INodeExecutionData | undefined;
  last: () => INodeExecutionData | undefined;
  all: () => INodeExecutionData[];
}

function nodeAccessor(ctx: IExpressionEvalContext, name: string): INodeAccessor {
  const runs = ctx.runData[name];
  const lastRun = runs?.[runs.length - 1];
  const items = lastRun?.data?.main[0] ?? [];
  const item = items[ctx.itemIndex] ?? items[0];
  return {
    item,
    get json() {
      return item?.json ?? {};
    },
    first: () => items[0],
    last: () => items[items.length - 1],
    all: () => items,
  };
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Single source of truth for the expression scope: `createScopeResolver` (the runtime) and
 * the editor's CodeMirror autocomplete source are both driven by this list, so they cannot
 * drift apart. Every symbol in the §4 scope table is represented exactly once here.
 */
export const EXPRESSION_SCOPE_DEFINITIONS: IExpressionScopeDefinition[] = [
  { key: '$json', kind: 'value', description: "Current item's JSON data.", resolve: (ctx) => ctx.item.json },
  {
    key: '$binary',
    kind: 'value',
    description: "Current item's binary data.",
    resolve: (ctx) => ctx.item.binary ?? {},
  },
  {
    key: '$node',
    kind: 'namespace',
    description: 'Access another node\'s output: $node["Node Name"].json',
    resolve: (ctx) => new Proxy({} as Record<string, INodeAccessor>, { get: (_t, prop) => nodeAccessor(ctx, String(prop)) }),
  },
  {
    key: '$',
    kind: 'function',
    description: 'Access another node\'s output: $("Node Name").item / .first() / .last() / .all()',
    resolve: (ctx) => (name: string) => nodeAccessor(ctx, name),
  },
  {
    key: '$input',
    kind: 'namespace',
    description: "This node's own input items: $input.item / .first() / .last() / .all()",
    resolve: (ctx) => ({
      item: ctx.inputItems[ctx.itemIndex] ?? ctx.inputItems[0],
      first: () => ctx.inputItems[0],
      last: () => ctx.inputItems[ctx.inputItems.length - 1],
      all: () => ctx.inputItems,
    }),
  },
  {
    key: '$items',
    kind: 'function',
    description: 'Legacy item accessor: $items(nodeName, outputIndex, runIndex)',
    resolve: (ctx) => (name: string, outputIndex = 0, runIndex?: number) => {
      const runs = ctx.runData[name] ?? [];
      const run = runIndex === undefined ? runs[runs.length - 1] : runs[runIndex];
      return run?.data?.main[outputIndex] ?? [];
    },
  },
  {
    key: '$parameter',
    kind: 'value',
    description: 'Sibling parameters on this node.',
    resolve: (ctx) => ctx.parameters ?? {},
  },
  {
    key: '$workflow',
    kind: 'value',
    description: 'The current workflow: { id, name, active }.',
    resolve: (ctx) => ({ id: ctx.workflow.id, name: ctx.workflow.name, active: ctx.workflow.active }),
  },
  {
    key: '$execution',
    kind: 'value',
    description: 'The current execution: { id, mode, resumeUrl }.',
    resolve: (ctx) => ({ id: ctx.execution?.id ?? '', mode: ctx.mode, resumeUrl: ctx.execution?.resumeUrl }),
  },
  {
    key: '$prevNode',
    kind: 'value',
    description: 'The node that fed data into this one: { name, outputIndex, runIndex }.',
    resolve: (ctx) => ctx.prevNode ?? {},
  },
  { key: '$now', kind: 'value', description: 'Current date/time as a Luxon DateTime.', resolve: () => DateTime.now() },
  {
    key: '$today',
    kind: 'value',
    description: "Start of today as a Luxon DateTime.",
    resolve: () => DateTime.now().startOf('day'),
  },
  { key: '$runIndex', kind: 'value', description: 'The current loop run index.', resolve: (ctx) => ctx.runIndex },
  { key: '$itemIndex', kind: 'value', description: 'The current item index.', resolve: (ctx) => ctx.itemIndex },
  {
    key: '$env',
    kind: 'value',
    description: 'Environment variables (gated by N8N_BLOCK_ENV_ACCESS_IN_NODE).',
    resolve: (ctx) => {
      if (ctx.blockEnvAccess) {
        throw new ExpressionError('Access to $env is blocked by the instance configuration.', {
          nodeName: ctx.node.name,
        });
      }
      return ctx.env ?? {};
    },
  },
  { key: '$vars', kind: 'value', description: 'Instance variables.', resolve: (ctx) => ctx.vars ?? {} },
  { key: '$secrets', kind: 'value', description: 'External secret-store values.', resolve: (ctx) => ctx.secrets ?? {} },
  {
    key: '$if',
    kind: 'function',
    description: '$if(condition, valueIfTrue, valueIfFalse)',
    resolve: () => (condition: unknown, whenTrue: unknown, whenFalse: unknown) => (condition ? whenTrue : whenFalse),
  },
  {
    key: '$ifEmpty',
    kind: 'function',
    description: '$ifEmpty(value, fallback) — returns fallback when value is null/undefined/""/empty.',
    resolve: () => (value: unknown, fallback: unknown) => (isEmptyValue(value) ? fallback : value),
  },
  {
    key: '$min',
    kind: 'function',
    description: '$min(...numbers)',
    resolve: () => (...values: number[]) => Math.min(...values),
  },
  {
    key: '$max',
    kind: 'function',
    description: '$max(...numbers)',
    resolve: () => (...values: number[]) => Math.max(...values),
  },
  {
    key: '$jmespath',
    kind: 'function',
    description: '$jmespath(data, expression) — a documented subset of JMESPath (see jmespath-lite.ts).',
    resolve: () => (data: unknown, expression: string) => jmespathLite(data, expression),
  },
];

const DEFINITIONS_BY_KEY = new Map(EXPRESSION_SCOPE_DEFINITIONS.map((def) => [def.key, def]));

export function getScopeDefinition(key: string): IExpressionScopeDefinition | undefined {
  return DEFINITIONS_BY_KEY.get(key);
}

/** Resolves a single identifier lazily against the context — `$env` only throws if the expression actually references it. */
export function createScopeResolver(ctx: IExpressionEvalContext): (name: string) => unknown {
  return (name: string) => {
    const definition = getScopeDefinition(name);
    if (!definition) {
      throw new ExpressionError(`Unknown variable "${name}"`, { nodeName: ctx.node.name });
    }
    return definition.resolve(ctx);
  };
}
