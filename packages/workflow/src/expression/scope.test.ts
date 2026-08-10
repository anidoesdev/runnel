import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { createScopeResolver, EXPRESSION_SCOPE_DEFINITIONS, getScopeDefinition } from './scope.js';
import { evaluateExpressionSource } from './template.js';
import { makeExpressionContext } from './test-utils.js';
import { ExpressionError } from '../interfaces/errors.js';
import type { IExpressionEvalContext } from '../interfaces/expression.interfaces.js';

function richContext(overrides: Partial<IExpressionEvalContext> = {}): IExpressionEvalContext {
  return makeExpressionContext({
    item: { json: { name: 'Alice', age: 30 } },
    itemIndex: 1,
    runIndex: 2,
    inputItems: [{ json: { x: 1 } }, { json: { x: 2 } }, { json: { x: 3 } }],
    workflow: { id: 'wf1', name: 'My WF', active: true, nodes: [], connections: {} },
    runData: {
      Prev: [
        {
          startTime: 0,
          executionTime: 0,
          executionStatus: 'success',
          source: [],
          data: {
            main: [
              [{ json: { a: 1 } }, { json: { a: 2 } }],
            ],
          },
        },
      ],
    },
    parameters: { foo: 'bar' },
    env: { MY_VAR: 'value' },
    vars: { v1: 'x' },
    secrets: { s1: 'secret' },
    execution: { id: 'exec1', resumeUrl: 'http://example.com/resume' },
    prevNode: { name: 'Prev', outputIndex: 0, runIndex: 0 },
    ...overrides,
  });
}

function evalIn(source: string, ctx: IExpressionEvalContext): unknown {
  return evaluateExpressionSource(source, ctx);
}

describe('scope — $json / $binary', () => {
  it('$json is the current item json', () => {
    expect(evalIn('$json', richContext())).toEqual({ name: 'Alice', age: 30 });
    expect(evalIn('$json.name', richContext())).toBe('Alice');
  });

  it('$binary defaults to an empty object when the item has none', () => {
    expect(evalIn('$binary', richContext())).toEqual({});
  });
});

describe('scope — $node / $(...)', () => {
  it('$node["Name"].json reads the item at the current item index from that node', () => {
    expect(evalIn('$node["Prev"].json.a', richContext())).toBe(2);
  });

  it('$node["Name"].first() / .last() / .all() read across that node\'s output', () => {
    const ctx = richContext();
    expect(evalIn('$node["Prev"].first().json.a', ctx)).toBe(1);
    expect(evalIn('$node["Prev"].last().json.a', ctx)).toBe(2);
    expect(evalIn('$node["Prev"].all().length', ctx)).toBe(2);
  });

  it('$("Name") is equivalent call-style access', () => {
    expect(evalIn('$("Prev").item.json.a', richContext())).toBe(2);
    expect(evalIn('$("Prev").first().json.a', richContext())).toBe(1);
  });
});

describe('scope — $input', () => {
  it('exposes the current node\'s own input items', () => {
    const ctx = richContext();
    expect(evalIn('$input.item.json.x', ctx)).toBe(2);
    expect(evalIn('$input.first().json.x', ctx)).toBe(1);
    expect(evalIn('$input.last().json.x', ctx)).toBe(3);
    expect(evalIn('$input.all().length', ctx)).toBe(3);
  });
});

describe('scope — $items legacy accessor', () => {
  it('returns the items for a given node/output/run', () => {
    const ctx = richContext();
    expect(evalIn('$items("Prev", 0).length', ctx)).toBe(2);
    expect(evalIn('$items("Prev", 0)[0].json.a', ctx)).toBe(1);
  });
});

describe('scope — $parameter / $workflow / $execution / $prevNode', () => {
  it('$parameter exposes sibling parameters', () => {
    expect(evalIn('$parameter.foo', richContext())).toBe('bar');
  });

  it('$workflow exposes id/name/active', () => {
    const ctx = richContext();
    expect(evalIn('$workflow.id', ctx)).toBe('wf1');
    expect(evalIn('$workflow.name', ctx)).toBe('My WF');
    expect(evalIn('$workflow.active', ctx)).toBe(true);
  });

  it('$execution exposes id/mode/resumeUrl', () => {
    const ctx = richContext();
    expect(evalIn('$execution.id', ctx)).toBe('exec1');
    expect(evalIn('$execution.mode', ctx)).toBe('manual');
    expect(evalIn('$execution.resumeUrl', ctx)).toBe('http://example.com/resume');
  });

  it('$prevNode exposes name/outputIndex/runIndex', () => {
    expect(evalIn('$prevNode.name', richContext())).toBe('Prev');
  });

  it('$parameter, $execution, and $prevNode default to an empty object/value when the host omits them', () => {
    const ctx = richContext({ parameters: undefined, execution: undefined, prevNode: undefined });
    expect(evalIn('$parameter', ctx)).toEqual({});
    expect(evalIn('$execution.id', ctx)).toBe('');
    expect(evalIn('$execution.resumeUrl', ctx)).toBeUndefined();
    expect(evalIn('$prevNode', ctx)).toEqual({});
  });
});

describe('scope — $now / $today', () => {
  it('$now is a valid Luxon DateTime', () => {
    const result = evalIn('$now', richContext());
    expect(DateTime.isDateTime(result)).toBe(true);
  });

  it('$today is a Luxon DateTime truncated to the start of the day', () => {
    const result = evalIn('$today', richContext()) as DateTime;
    expect(DateTime.isDateTime(result)).toBe(true);
    expect(result.hour).toBe(0);
    expect(result.minute).toBe(0);
  });
});

describe('scope — $runIndex / $itemIndex', () => {
  it('reflect the context values directly', () => {
    const ctx = richContext();
    expect(evalIn('$runIndex', ctx)).toBe(2);
    expect(evalIn('$itemIndex', ctx)).toBe(1);
  });
});

describe('scope — $env gating', () => {
  it('returns injected env vars when access is not blocked', () => {
    expect(evalIn('$env.MY_VAR', richContext())).toBe('value');
  });

  it('throws when blockEnvAccess is set, only if $env is actually referenced', () => {
    const ctx = richContext({ blockEnvAccess: true });
    expect(() => evalIn('$env.MY_VAR', ctx)).toThrow(ExpressionError);
    expect(() => evalIn('$env', ctx)).toThrow(/blocked/);
    // an expression that never touches $env must not be affected by the gate
    expect(evalIn('$json.name', ctx)).toBe('Alice');
  });
});

describe('scope — $vars / $secrets', () => {
  it('expose injected instance variables and secrets', () => {
    const ctx = richContext();
    expect(evalIn('$vars.v1', ctx)).toBe('x');
    expect(evalIn('$secrets.s1', ctx)).toBe('secret');
  });

  it('default to an empty object when not provided', () => {
    const ctx = richContext({ vars: undefined, secrets: undefined });
    expect(evalIn('$vars', ctx)).toEqual({});
    expect(evalIn('$secrets', ctx)).toEqual({});
  });
});

describe('scope — helper functions $if / $ifEmpty / $min / $max / $jmespath', () => {
  const ctx = richContext();

  it('$if branches on the condition', () => {
    expect(evalIn('$if(true, "a", "b")', ctx)).toBe('a');
    expect(evalIn('$if(false, "a", "b")', ctx)).toBe('b');
  });

  it('$ifEmpty falls back only for empty values', () => {
    expect(evalIn('$ifEmpty("", "fallback")', ctx)).toBe('fallback');
    expect(evalIn('$ifEmpty(null, "fallback")', ctx)).toBe('fallback');
    expect(evalIn('$ifEmpty("x", "fallback")', ctx)).toBe('x');
  });

  it('$min / $max', () => {
    expect(evalIn('$min(3, 1, 2)', ctx)).toBe(1);
    expect(evalIn('$max(3, 1, 2)', ctx)).toBe(3);
  });

  it('$jmespath evaluates the lite subset against arbitrary data', () => {
    expect(evalIn('$jmespath($json, "name")', richContext())).toBe('Alice');
  });
});

describe('createScopeResolver', () => {
  it('throws ExpressionError for a completely unknown symbol', () => {
    const resolve = createScopeResolver(richContext());
    expect(() => resolve('$doesNotExist')).toThrow(ExpressionError);
    expect(() => resolve('$doesNotExist')).toThrow(/Unknown variable/);
  });
});

describe('EXPRESSION_SCOPE_DEFINITIONS / getScopeDefinition', () => {
  const expectedKeys = [
    '$json',
    '$binary',
    '$node',
    '$',
    '$input',
    '$items',
    '$parameter',
    '$workflow',
    '$execution',
    '$prevNode',
    '$now',
    '$today',
    '$runIndex',
    '$itemIndex',
    '$env',
    '$vars',
    '$secrets',
    '$if',
    '$ifEmpty',
    '$min',
    '$max',
    '$jmespath',
  ];

  it('declares every symbol from the §4 scope table exactly once', () => {
    const keys = EXPRESSION_SCOPE_DEFINITIONS.map((def) => def.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of expectedKeys) expect(keys).toContain(key);
  });

  it('getScopeDefinition looks up by key and returns undefined otherwise', () => {
    expect(getScopeDefinition('$json')?.kind).toBe('value');
    expect(getScopeDefinition('$doesNotExist')).toBeUndefined();
  });
});
