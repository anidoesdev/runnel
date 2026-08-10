import { describe, expect, it } from 'vitest';
import { parseExpressionSource } from './parser.js';
import type { Expr } from './ast.js';

describe('parseExpressionSource', () => {
  it('parses number, string, boolean, null, and undefined literals', () => {
    expect(parseExpressionSource('42')).toEqual({ kind: 'Literal', value: 42 });
    expect(parseExpressionSource('"hi"')).toEqual({ kind: 'Literal', value: 'hi' });
    expect(parseExpressionSource('true')).toEqual({ kind: 'Literal', value: true });
    expect(parseExpressionSource('false')).toEqual({ kind: 'Literal', value: false });
    expect(parseExpressionSource('null')).toEqual({ kind: 'Literal', value: null });
    expect(parseExpressionSource('undefined')).toEqual({ kind: 'Literal', value: undefined });
  });

  it('parses an identifier', () => {
    expect(parseExpressionSource('$json')).toEqual({ kind: 'Identifier', name: '$json' });
  });

  it('parses dot and bracket member access', () => {
    expect(parseExpressionSource('$json.foo')).toEqual({
      kind: 'Member',
      object: { kind: 'Identifier', name: '$json' },
      property: { kind: 'Literal', value: 'foo' },
      computed: false,
      optional: false,
    });
    expect(parseExpressionSource('$json["foo"]')).toEqual({
      kind: 'Member',
      object: { kind: 'Identifier', name: '$json' },
      property: { kind: 'Literal', value: 'foo' },
      computed: true,
      optional: false,
    });
  });

  it('parses optional chaining for member access and calls', () => {
    expect(parseExpressionSource('$json?.foo')).toMatchObject({ kind: 'Member', optional: true });
    expect(parseExpressionSource('foo?.()')).toMatchObject({ kind: 'Call', optional: true });
  });

  it('parses a call expression with arguments', () => {
    expect(parseExpressionSource('$max(1, 2, 3)')).toEqual({
      kind: 'Call',
      callee: { kind: 'Identifier', name: '$max' },
      args: [
        { kind: 'Literal', value: 1 },
        { kind: 'Literal', value: 2 },
        { kind: 'Literal', value: 3 },
      ],
      optional: false,
    });
  });

  it('chains member and call expressions left to right', () => {
    const ast = parseExpressionSource('$json.name.toUpperCase()');
    expect(ast).toEqual({
      kind: 'Call',
      callee: {
        kind: 'Member',
        object: {
          kind: 'Member',
          object: { kind: 'Identifier', name: '$json' },
          property: { kind: 'Literal', value: 'name' },
          computed: false,
          optional: false,
        },
        property: { kind: 'Literal', value: 'toUpperCase' },
        computed: false,
        optional: false,
      },
      args: [],
      optional: false,
    });
  });

  it('respects arithmetic precedence (multiplication before addition)', () => {
    const ast = parseExpressionSource('1 + 2 * 3') as Extract<Expr, { kind: 'Binary' }>;
    expect(ast).toEqual({
      kind: 'Binary',
      operator: '+',
      left: { kind: 'Literal', value: 1 },
      right: {
        kind: 'Binary',
        operator: '*',
        left: { kind: 'Literal', value: 2 },
        right: { kind: 'Literal', value: 3 },
      },
    });
  });

  it('makes ** right-associative', () => {
    const ast = parseExpressionSource('2 ** 3 ** 2') as Extract<Expr, { kind: 'Binary' }>;
    expect(ast.right).toEqual({
      kind: 'Binary',
      operator: '**',
      left: { kind: 'Literal', value: 3 },
      right: { kind: 'Literal', value: 2 },
    });
  });

  it('parses logical operators distinctly from binary operators', () => {
    expect(parseExpressionSource('a && b')).toMatchObject({ kind: 'Logical', operator: '&&' });
    expect(parseExpressionSource('a || b')).toMatchObject({ kind: 'Logical', operator: '||' });
    expect(parseExpressionSource('a ?? b')).toMatchObject({ kind: 'Logical', operator: '??' });
  });

  it('parses unary operators', () => {
    expect(parseExpressionSource('-5')).toEqual({ kind: 'Unary', operator: '-', argument: { kind: 'Literal', value: 5 } });
    expect(parseExpressionSource('!x')).toEqual({
      kind: 'Unary',
      operator: '!',
      argument: { kind: 'Identifier', name: 'x' },
    });
  });

  it('parses a ternary, right-associatively for nested ternaries', () => {
    const ast = parseExpressionSource('a ? b : c ? d : e');
    expect(ast).toEqual({
      kind: 'Conditional',
      test: { kind: 'Identifier', name: 'a' },
      consequent: { kind: 'Identifier', name: 'b' },
      alternate: {
        kind: 'Conditional',
        test: { kind: 'Identifier', name: 'c' },
        consequent: { kind: 'Identifier', name: 'd' },
        alternate: { kind: 'Identifier', name: 'e' },
      },
    });
  });

  it('parses parenthesized expressions overriding precedence', () => {
    const ast = parseExpressionSource('(1 + 2) * 3') as Extract<Expr, { kind: 'Binary' }>;
    expect(ast.operator).toBe('*');
    expect(ast.left).toEqual({
      kind: 'Binary',
      operator: '+',
      left: { kind: 'Literal', value: 1 },
      right: { kind: 'Literal', value: 2 },
    });
  });

  it('parses array literals', () => {
    expect(parseExpressionSource('[1, 2, 3]')).toEqual({
      kind: 'ArrayLiteral',
      elements: [
        { kind: 'Literal', value: 1 },
        { kind: 'Literal', value: 2 },
        { kind: 'Literal', value: 3 },
      ],
    });
    expect(parseExpressionSource('[]')).toEqual({ kind: 'ArrayLiteral', elements: [] });
  });

  it('parses object literals with identifier, string, numeric, and computed keys', () => {
    expect(parseExpressionSource('{a: 1, "b": 2, 3: "x", [k]: 4}')).toEqual({
      kind: 'ObjectLiteral',
      properties: [
        { key: 'a', computed: false, value: { kind: 'Literal', value: 1 } },
        { key: 'b', computed: false, value: { kind: 'Literal', value: 2 } },
        { key: '3', computed: false, value: { kind: 'Literal', value: 'x' } },
        { key: '', computed: true, keyExpr: { kind: 'Identifier', name: 'k' }, value: { kind: 'Literal', value: 4 } },
      ],
    });
  });

  it('parses a template literal into a TemplateLiteral node', () => {
    const ast = parseExpressionSource('`a${1}b`');
    expect(ast).toEqual({
      kind: 'TemplateLiteral',
      quasis: ['a', 'b'],
      expressions: [{ kind: 'Literal', value: 1 }],
    });
  });

  it('throws on an unexpected trailing token', () => {
    expect(() => parseExpressionSource('1 2')).toThrow(/Unexpected trailing token/);
  });

  it('throws when a closing punctuator is missing', () => {
    expect(() => parseExpressionSource('(1 + 2')).toThrow(/Expected "\)"/);
    expect(() => parseExpressionSource('[1, 2')).toThrow(/Expected "\]"/);
  });

  it('describes an identifier or punctuator token in the error when found where a closer was expected', () => {
    expect(() => parseExpressionSource('(1 + 2 oops')).toThrow(/identifier "oops"/);
    expect(() => parseExpressionSource('(1 + 2]')).toThrow(/"\]"/);
  });

  it('throws on a malformed object literal', () => {
    expect(() => parseExpressionSource('{1 2}')).toThrow();
    expect(() => parseExpressionSource('{: 1}')).toThrow(/Expected object property key/);
  });

  it('throws on a stray closing punctuator in primary position', () => {
    expect(() => parseExpressionSource(')')).toThrow(/Unexpected token/);
  });

  it('throws on a dangling operator', () => {
    expect(() => parseExpressionSource('1 +')).toThrow();
  });

  it('throws on an empty expression', () => {
    expect(() => parseExpressionSource('')).toThrow();
  });
});
