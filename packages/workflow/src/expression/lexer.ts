import { ExpressionError } from '../interfaces/errors.js';

export type Token =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'template'; parts: TemplatePart[] }
  | { type: 'ident'; value: string }
  | { type: 'punct'; value: string }
  | { type: 'eof' };

export type TemplatePart = { type: 'str'; value: string } | { type: 'expr'; tokens: Token[] };

const PUNCTUATORS = [
  '===',
  '!==',
  '**',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '??',
  '?.',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  ',',
  '.',
  ':',
  '?',
  '!',
  '<',
  '>',
  '+',
  '-',
  '*',
  '/',
  '%',
];

const IDENT_START = /[$_a-zA-Z]/;
const IDENT_PART = /[$_a-zA-Z0-9]/;

function fail(message: string): never {
  throw new ExpressionError(message, { nodeName: '' });
}

function unescapeChar(char: string): string {
  switch (char) {
    case 'n':
      return '\n';
    case 't':
      return '\t';
    case 'r':
      return '\r';
    default:
      return char;
  }
}

class Cursor {
  pos = 0;
  constructor(public readonly src: string) {}
  get current(): string | undefined {
    return this.src[this.pos];
  }
  slice(start: number, end: number): string {
    return this.src.slice(start, end);
  }
  get atEnd(): boolean {
    return this.pos >= this.src.length;
  }
}

function readQuotedString(cursor: Cursor, quote: string): string {
  cursor.pos++; // skip opening quote
  let value = '';
  while (!cursor.atEnd && cursor.current !== quote) {
    const char = cursor.current!;
    if (char === '\\') {
      cursor.pos++;
      value += unescapeChar(cursor.current ?? '');
      cursor.pos++;
    } else {
      value += char;
      cursor.pos++;
    }
  }
  if (cursor.atEnd) fail(`Unterminated string literal`);
  cursor.pos++; // skip closing quote
  return value;
}

/** Finds the index of the `}` that closes the `${` interpolation starting at `startPos`, skipping over nested strings/templates/braces. */
function findInterpolationEnd(src: string, startPos: number): number {
  let depth = 1;
  let pos = startPos;
  while (pos < src.length) {
    const char = src[pos];
    if (char === '{') {
      depth++;
      pos++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) return pos;
      pos++;
    } else if (char === "'" || char === '"' || char === '`') {
      pos = skipStringLiteral(src, pos, char);
    } else {
      pos++;
    }
  }
  throw new ExpressionError('Unterminated template interpolation `${...}`', { nodeName: '' });
}

/** Returns the index just past the closing quote, treating `` ` `` bodies as opaque (nested `${}` inside a nested template is not re-entered — an edge case out of scope for M3). */
export function skipStringLiteral(src: string, start: number, quote: string): number {
  let pos = start + 1;
  while (pos < src.length && src[pos] !== quote) {
    if (src[pos] === '\\') pos++;
    pos++;
  }
  return pos + 1;
}

function readTemplateLiteral(cursor: Cursor): TemplatePart[] {
  cursor.pos++; // skip opening backtick
  const parts: TemplatePart[] = [];
  let buffer = '';

  while (!cursor.atEnd && cursor.current !== '`') {
    if (cursor.current === '\\') {
      cursor.pos++;
      buffer += unescapeChar(cursor.current ?? '');
      cursor.pos++;
      continue;
    }
    if (cursor.current === '$' && cursor.src[cursor.pos + 1] === '{') {
      parts.push({ type: 'str', value: buffer });
      buffer = '';
      const exprStart = cursor.pos + 2;
      const exprEnd = findInterpolationEnd(cursor.src, exprStart);
      const exprSource = cursor.slice(exprStart, exprEnd);
      parts.push({ type: 'expr', tokens: tokenize(exprSource) });
      cursor.pos = exprEnd + 1;
      continue;
    }
    buffer += cursor.current;
    cursor.pos++;
  }
  if (cursor.atEnd) fail('Unterminated template literal');
  cursor.pos++; // skip closing backtick
  parts.push({ type: 'str', value: buffer });
  return parts;
}

export function tokenize(source: string): Token[] {
  const cursor = new Cursor(source);
  const tokens: Token[] = [];

  while (!cursor.atEnd) {
    const char = cursor.current!;

    if (/\s/.test(char)) {
      cursor.pos++;
      continue;
    }

    if (char === "'" || char === '"') {
      tokens.push({ type: 'str', value: readQuotedString(cursor, char) });
      continue;
    }

    if (char === '`') {
      tokens.push({ type: 'template', parts: readTemplateLiteral(cursor) });
      continue;
    }

    if (/[0-9]/.test(char)) {
      const match = /^\d+(\.\d+)?([eE][+-]?\d+)?/.exec(cursor.src.slice(cursor.pos));
      const text = match![0];
      tokens.push({ type: 'num', value: Number(text) });
      cursor.pos += text.length;
      continue;
    }

    if (IDENT_START.test(char)) {
      let end = cursor.pos + 1;
      while (end < cursor.src.length && IDENT_PART.test(cursor.src[end]!)) end++;
      tokens.push({ type: 'ident', value: cursor.slice(cursor.pos, end) });
      cursor.pos = end;
      continue;
    }

    const punct = PUNCTUATORS.find((p) => cursor.src.startsWith(p, cursor.pos));
    if (punct) {
      tokens.push({ type: 'punct', value: punct });
      cursor.pos += punct.length;
      continue;
    }

    fail(`Unexpected character "${char}" in expression`);
  }

  tokens.push({ type: 'eof' });
  return tokens;
}
