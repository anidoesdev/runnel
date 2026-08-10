import { ExpressionError } from '../interfaces/errors.js';
import { tokenize } from './lexer.js';
import type { Token, TemplatePart } from './lexer.js';
import type { Expr, ObjectProperty } from './ast.js';

const PRECEDENCE: Record<string, number> = {
  '??': 1,
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '===': 3,
  '!==': 3,
  '<': 4,
  '>': 4,
  '<=': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
  '**': 7,
};
const RIGHT_ASSOCIATIVE = new Set(['**']);
const LOGICAL_OPERATORS = new Set(['&&', '||', '??']);

function fail(message: string): never {
  throw new ExpressionError(message, { nodeName: '' });
}

class TokenStream {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  peek(offset = 0): Token {
    return this.tokens[this.index + offset] ?? { type: 'eof' };
  }

  next(): Token {
    const token = this.peek();
    this.index++;
    return token;
  }

  isPunct(value: string): boolean {
    const token = this.peek();
    return token.type === 'punct' && token.value === value;
  }

  expectPunct(value: string): void {
    if (!this.isPunct(value)) fail(`Expected "${value}" but found ${describeToken(this.peek())}`);
    this.next();
  }

  expectEof(): void {
    if (this.peek().type !== 'eof') fail(`Unexpected trailing token ${describeToken(this.peek())}`);
  }
}

function describeToken(token: Token): string {
  switch (token.type) {
    case 'eof':
      return 'end of expression';
    case 'ident':
      return `identifier "${token.value}"`;
    case 'punct':
      return `"${token.value}"`;
    default:
      return token.type;
  }
}

function parseTernary(stream: TokenStream): Expr {
  const test = parseBinary(stream, 0);
  if (stream.isPunct('?')) {
    stream.next();
    const consequent = parseTernary(stream);
    stream.expectPunct(':');
    const alternate = parseTernary(stream);
    return { kind: 'Conditional', test, consequent, alternate };
  }
  return test;
}

function parseBinary(stream: TokenStream, minPrecedence: number): Expr {
  let left = parseUnary(stream);

  for (;;) {
    const token = stream.peek();
    if (token.type !== 'punct') break;
    const precedence = PRECEDENCE[token.value];
    if (precedence === undefined || precedence < minPrecedence) break;

    stream.next();
    const nextMinPrecedence = RIGHT_ASSOCIATIVE.has(token.value) ? precedence : precedence + 1;
    const right = parseBinary(stream, nextMinPrecedence);

    left = LOGICAL_OPERATORS.has(token.value)
      ? { kind: 'Logical', operator: token.value as '&&' | '||' | '??', left, right }
      : { kind: 'Binary', operator: token.value, left, right };
  }

  return left;
}

function parseUnary(stream: TokenStream): Expr {
  const token = stream.peek();
  if (token.type === 'punct' && (token.value === '!' || token.value === '-' || token.value === '+')) {
    stream.next();
    return { kind: 'Unary', operator: token.value, argument: parseUnary(stream) };
  }
  return parsePostfix(stream);
}

function parsePostfix(stream: TokenStream): Expr {
  let base = parsePrimary(stream);

  for (;;) {
    if (stream.isPunct('.')) {
      stream.next();
      const ident = stream.next();
      if (ident.type !== 'ident') fail(`Expected property name after "." but found ${describeToken(ident)}`);
      base = {
        kind: 'Member',
        object: base,
        property: { kind: 'Literal', value: ident.value },
        computed: false,
        optional: false,
      };
      continue;
    }

    if (stream.isPunct('?.')) {
      stream.next();
      if (stream.isPunct('(')) {
        stream.next();
        const args = parseArgList(stream);
        stream.expectPunct(')');
        base = { kind: 'Call', callee: base, args, optional: true };
      } else {
        const ident = stream.next();
        if (ident.type !== 'ident') fail(`Expected property name after "?." but found ${describeToken(ident)}`);
        base = {
          kind: 'Member',
          object: base,
          property: { kind: 'Literal', value: ident.value },
          computed: false,
          optional: true,
        };
      }
      continue;
    }

    if (stream.isPunct('[')) {
      stream.next();
      const property = parseTernary(stream);
      stream.expectPunct(']');
      base = { kind: 'Member', object: base, property, computed: true, optional: false };
      continue;
    }

    if (stream.isPunct('(')) {
      stream.next();
      const args = parseArgList(stream);
      stream.expectPunct(')');
      base = { kind: 'Call', callee: base, args, optional: false };
      continue;
    }

    break;
  }

  return base;
}

function parseArgList(stream: TokenStream): Expr[] {
  const args: Expr[] = [];
  if (stream.isPunct(')')) return args;
  args.push(parseTernary(stream));
  while (stream.isPunct(',')) {
    stream.next();
    args.push(parseTernary(stream));
  }
  return args;
}

function parseTemplateParts(parts: TemplatePart[]): Expr {
  const quasis: string[] = [];
  const expressions: Expr[] = [];
  for (const part of parts) {
    if (part.type === 'str') {
      quasis.push(part.value);
    } else {
      expressions.push(parseTernary(new TokenStream(part.tokens)));
    }
  }
  return { kind: 'TemplateLiteral', quasis, expressions };
}

function parsePrimary(stream: TokenStream): Expr {
  const token = stream.next();

  switch (token.type) {
    case 'num':
      return { kind: 'Literal', value: token.value };
    case 'str':
      return { kind: 'Literal', value: token.value };
    case 'template':
      return parseTemplateParts(token.parts);
    case 'ident':
      switch (token.value) {
        case 'true':
          return { kind: 'Literal', value: true };
        case 'false':
          return { kind: 'Literal', value: false };
        case 'null':
          return { kind: 'Literal', value: null };
        case 'undefined':
          return { kind: 'Literal', value: undefined };
        default:
          return { kind: 'Identifier', name: token.value };
      }
    case 'punct':
      if (token.value === '(') {
        const expr = parseTernary(stream);
        stream.expectPunct(')');
        return expr;
      }
      if (token.value === '[') {
        const elements: Expr[] = [];
        if (!stream.isPunct(']')) {
          elements.push(parseTernary(stream));
          while (stream.isPunct(',')) {
            stream.next();
            elements.push(parseTernary(stream));
          }
        }
        stream.expectPunct(']');
        return { kind: 'ArrayLiteral', elements };
      }
      if (token.value === '{') {
        const properties: ObjectProperty[] = [];
        if (!stream.isPunct('}')) {
          properties.push(parseObjectProperty(stream));
          while (stream.isPunct(',')) {
            stream.next();
            properties.push(parseObjectProperty(stream));
          }
        }
        stream.expectPunct('}');
        return { kind: 'ObjectLiteral', properties };
      }
      fail(`Unexpected token ${describeToken(token)}`);
      break;
    default:
      fail(`Unexpected ${describeToken(token)}`);
  }
}

function parseObjectProperty(stream: TokenStream): ObjectProperty {
  if (stream.isPunct('[')) {
    stream.next();
    const keyExpr = parseTernary(stream);
    stream.expectPunct(']');
    stream.expectPunct(':');
    const value = parseTernary(stream);
    return { key: '', computed: true, keyExpr, value };
  }

  const keyToken = stream.next();
  let key: string;
  if (keyToken.type === 'ident') key = keyToken.value;
  else if (keyToken.type === 'str') key = keyToken.value;
  else if (keyToken.type === 'num') key = String(keyToken.value);
  else return fail(`Expected object property key but found ${describeToken(keyToken)}`);

  stream.expectPunct(':');
  const value = parseTernary(stream);
  return { key, computed: false, value };
}

export function parseExpressionSource(source: string): Expr {
  const stream = new TokenStream(tokenize(source));
  const expr = parseTernary(stream);
  stream.expectEof();
  return expr;
}
