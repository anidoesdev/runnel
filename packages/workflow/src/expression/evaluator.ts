import { ExpressionError } from '../interfaces/errors.js';
import { getExtension } from './extensions.js';
import type { IDataObject } from '../interfaces/common.interfaces.js';
import type { Expr } from './ast.js';

/**
 * Property names that would let an expression climb out of the sandbox via prototype chain
 * access (the classic `''.constructor.constructor('return process')()` escape). Blocked
 * regardless of the target value's identity — this is the one hard security boundary the
 * evaluator enforces; everything else (which bare identifiers even resolve to) is closed off
 * simply by the scope resolver only knowing about the symbols in scope.ts.
 */
const BLOCKED_PROPERTY_NAMES = new Set([
  'constructor',
  '__proto__',
  'prototype',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
]);

export interface EvaluateOptions {
  maxSteps?: number;
}

type Callable = (...args: unknown[]) => unknown;

function isCallable(value: unknown): value is Callable {
  return typeof value === 'function';
}

export function stringifyForTemplate(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function evaluateBinary(operator: string, left: unknown, right: unknown, nodeName: string): unknown {
  switch (operator) {
    case '+':
      return (left as never) + (right as never);
    case '-':
      return (left as number) - (right as number);
    case '*':
      return (left as number) * (right as number);
    case '/':
      return (left as number) / (right as number);
    case '%':
      return (left as number) % (right as number);
    case '**':
      return (left as number) ** (right as number);
    case '==':
      return left == right;
    case '!=':
      return left != right;
    case '===':
      return left === right;
    case '!==':
      return left !== right;
    case '<':
      return (left as number) < (right as number);
    case '>':
      return (left as number) > (right as number);
    case '<=':
      return (left as number) <= (right as number);
    case '>=':
      return (left as number) >= (right as number);
    default:
      throw new ExpressionError(`Unknown binary operator "${operator}"`, { nodeName });
  }
}

export function evaluateAst(
  expr: Expr,
  resolveIdentifier: (name: string) => unknown,
  nodeName: string,
  options: EvaluateOptions = {},
): unknown {
  const maxSteps = options.maxSteps ?? 100_000;
  let steps = 0;

  const checkBudget = (): void => {
    steps++;
    if (steps > maxSteps) {
      throw new ExpressionError('Expression evaluation exceeded the maximum step budget', { nodeName });
    }
  };

  const checkPropertyName = (name: string): void => {
    if (BLOCKED_PROPERTY_NAMES.has(name)) {
      throw new ExpressionError(`Access to "${name}" is not allowed in expressions`, { nodeName });
    }
  };

  const getMember = (object: unknown, propName: string): unknown => {
    checkPropertyName(propName);
    if (object === null || object === undefined) {
      throw new ExpressionError(`Cannot read property "${propName}" of ${String(object)}`, { nodeName });
    }
    return (object as Record<string, unknown>)[propName];
  };

  const evaluateCallExpr = (node: Extract<Expr, { kind: 'Call' }>): unknown => {
    if (node.callee.kind === 'Member') {
      const object = evaluate(node.callee.object);
      if (node.callee.optional && (object === null || object === undefined)) return undefined;

      const propName = node.callee.computed
        ? String(evaluate(node.callee.property))
        : (node.callee.property as Extract<Expr, { kind: 'Literal' }>).value;
      checkPropertyName(String(propName));

      const args = node.args.map(evaluate);

      const extension = getExtension(object, String(propName));
      if (extension) return extension(object, args);

      if (object === null || object === undefined) {
        throw new ExpressionError(`Cannot call method "${String(propName)}" on ${String(object)}`, { nodeName });
      }
      const fn = (object as Record<string, unknown>)[String(propName)];
      if (!isCallable(fn)) {
        if (node.optional) return undefined;
        throw new ExpressionError(`"${String(propName)}" is not a function`, { nodeName });
      }
      return fn.apply(object, args);
    }

    const callee = evaluate(node.callee);
    if (node.optional && (callee === null || callee === undefined)) return undefined;
    if (!isCallable(callee)) {
      throw new ExpressionError('Attempted to call a non-function value', { nodeName });
    }
    return callee(...node.args.map(evaluate));
  };

  function evaluate(node: Expr): unknown {
    checkBudget();

    switch (node.kind) {
      case 'Literal':
        return node.value;

      case 'TemplateLiteral': {
        let result = node.quasis[0] ?? '';
        for (let i = 0; i < node.expressions.length; i++) {
          result += stringifyForTemplate(evaluate(node.expressions[i]!));
          result += node.quasis[i + 1] ?? '';
        }
        return result;
      }

      case 'Identifier':
        return resolveIdentifier(node.name);

      case 'ArrayLiteral':
        return node.elements.map(evaluate);

      case 'ObjectLiteral': {
        const obj: IDataObject = {};
        for (const prop of node.properties) {
          const key = prop.computed ? String(evaluate(prop.keyExpr!)) : prop.key;
          obj[key] = evaluate(prop.value) as IDataObject[string];
        }
        return obj;
      }

      case 'Unary': {
        const value = evaluate(node.argument);
        if (node.operator === '!') return !value;
        if (node.operator === '-') return -(value as number);
        return +(value as number);
      }

      case 'Binary':
        return evaluateBinary(node.operator, evaluate(node.left), evaluate(node.right), nodeName);

      case 'Logical': {
        const left = evaluate(node.left);
        if (node.operator === '&&') return left ? evaluate(node.right) : left;
        if (node.operator === '||') return left ? left : evaluate(node.right);
        return left ?? evaluate(node.right);
      }

      case 'Conditional':
        return evaluate(node.test) ? evaluate(node.consequent) : evaluate(node.alternate);

      case 'Member': {
        const object = evaluate(node.object);
        if (node.optional && (object === null || object === undefined)) return undefined;
        const propName = node.computed
          ? String(evaluate(node.property))
          : (node.property as Extract<Expr, { kind: 'Literal' }>).value;
        return getMember(object, String(propName));
      }

      case 'Call':
        return evaluateCallExpr(node);

      default: {
        const exhaustive: never = node;
        throw new ExpressionError(`Unknown AST node "${JSON.stringify(exhaustive)}"`, { nodeName });
      }
    }
  }

  return evaluate(expr);
}
