import { ExpressionError } from '../interfaces/errors.js';
import { evaluateAst, stringifyForTemplate } from './evaluator.js';
import { parseExpressionSource } from './parser.js';
import { createScopeResolver } from './scope.js';
import { skipStringLiteral } from './lexer.js';
import type { IExpressionEvalContext } from '../interfaces/expression.interfaces.js';

/** A parameter's raw string value is expression-enabled only when it begins with "=". */
export function isExpression(rawValue: string): boolean {
  return rawValue.startsWith('=');
}

type TemplateSegment = { type: 'text'; value: string } | { type: 'expr'; source: string };

/** Finds the `}}` that closes a `{{` block, skipping over nested braces/strings so an object literal `{{ {a:{b:1}} }}` doesn't get truncated at its own closing braces. */
function findClosingDoubleBrace(source: string, start: number): number {
  let depth = 0;
  let pos = start;
  while (pos < source.length) {
    const char = source[pos];
    if (char === "'" || char === '"' || char === '`') {
      pos = skipStringLiteral(source, pos, char);
      continue;
    }
    if (char === '{') {
      depth++;
      pos++;
      continue;
    }
    if (char === '}') {
      if (depth > 0) {
        depth--;
        pos++;
        continue;
      }
      if (source[pos + 1] === '}') return pos;
      pos++;
      continue;
    }
    pos++;
  }
  throw new ExpressionError('Unterminated "{{ ... }}" expression block', { nodeName: '' });
}

function splitTemplate(source: string): TemplateSegment[] {
  const segments: TemplateSegment[] = [];
  let textBuffer = '';
  let i = 0;

  while (i < source.length) {
    if (source[i] === '{' && source[i + 1] === '{') {
      if (textBuffer) {
        segments.push({ type: 'text', value: textBuffer });
        textBuffer = '';
      }
      const exprStart = i + 2;
      const exprEnd = findClosingDoubleBrace(source, exprStart);
      segments.push({ type: 'expr', source: source.slice(exprStart, exprEnd) });
      i = exprEnd + 2;
      continue;
    }
    textBuffer += source[i];
    i++;
  }

  if (textBuffer) segments.push({ type: 'text', value: textBuffer });
  return segments;
}

export interface EvaluateExpressionOptions {
  maxSteps?: number;
}

/** Parses and evaluates a bare expression body (no `=` prefix, no `{{ }}` wrapper) — the building block `evaluateExpressionString` is built on, exposed for the editor's live-preview field and for testing. */
export function evaluateExpressionSource(
  source: string,
  context: IExpressionEvalContext,
  options: EvaluateExpressionOptions = {},
): unknown {
  const ast = parseExpressionSource(source);
  return evaluateAst(ast, createScopeResolver(context), context.node.name, options);
}

/**
 * Evaluates a raw parameter string. Non-expression strings (not starting with "=") pass
 * through unchanged. When the whole expression body is exactly one `{{ ... }}` block (with
 * at most surrounding whitespace as literal text), the raw evaluated value is returned —
 * preserving its type — so an expression can resolve to an object, array, or number rather
 * than always being coerced to a string. Any other mix of literal text and `{{ }}` blocks is
 * concatenated as a string, using JSON.stringify for object/array results.
 */
export function evaluateExpressionString(
  rawValue: string,
  context: IExpressionEvalContext,
  options: EvaluateExpressionOptions = {},
): unknown {
  if (!isExpression(rawValue)) return rawValue;

  const body = rawValue.slice(1);
  const segments = splitTemplate(body);

  const exprSegments = segments.filter((s) => s.type === 'expr');
  const nonBlankTextSegments = segments.filter((s) => s.type === 'text' && s.value.trim() !== '');

  if (exprSegments.length === 1 && nonBlankTextSegments.length === 0) {
    const only = exprSegments[0] as Extract<TemplateSegment, { type: 'expr' }>;
    return evaluateExpressionSource(only.source, context, options);
  }

  let result = '';
  for (const segment of segments) {
    if (segment.type === 'text') {
      result += segment.value;
    } else {
      result += stringifyForTemplate(evaluateExpressionSource(segment.source, context, options));
    }
  }
  return result;
}
