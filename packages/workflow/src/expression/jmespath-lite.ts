import type { IDataObject } from '../interfaces/common.interfaces.js';

/**
 * A deliberately small subset of JMESPath for `$jmespath(data, expression)`: dot-separated
 * field access, `[n]` / `[-n]` array indexing, `[*]` projection, and `|` piping between
 * stages. The full JMESPath grammar (multi-select, filters, functions, slices) is out of
 * scope for M3 — this covers the field-extraction use cases that come up in workflows
 * without pulling in a full grammar implementation.
 */
type Step = { type: 'field'; name: string } | { type: 'index'; index: number } | { type: 'wildcard' };

function parseSteps(path: string): Step[] {
  const steps: Step[] = [];
  const pattern = /([^.[\]]+)|\[(\*|-?\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      steps.push({ type: 'field', name: match[1] });
    } else if (match[2] === '*') {
      steps.push({ type: 'wildcard' });
    } else {
      steps.push({ type: 'index', index: Number(match[2]) });
    }
  }
  return steps;
}

function applyStep(value: unknown, step: Extract<Step, { type: 'field' | 'index' }>): unknown {
  if (value === null || value === undefined) return undefined;
  if (step.type === 'field') {
    if (typeof value !== 'object' || Array.isArray(value)) return undefined;
    return (value as IDataObject)[step.name];
  }
  if (!Array.isArray(value)) return undefined;
  const index = step.index < 0 ? value.length + step.index : step.index;
  return value[index];
}

function evalSteps(value: unknown, steps: Step[]): unknown {
  let current = value;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (step.type === 'wildcard') {
      if (!Array.isArray(current)) return undefined;
      const rest = steps.slice(i + 1);
      return current.map((entry) => evalSteps(entry, rest)).filter((entry) => entry !== undefined);
    }
    current = applyStep(current, step);
  }
  return current;
}

export function jmespathLite(data: unknown, expression: string): unknown {
  let current = data;
  for (const stage of expression.split('|')) {
    current = evalSteps(current, parseSteps(stage.trim()));
  }
  return current;
}
