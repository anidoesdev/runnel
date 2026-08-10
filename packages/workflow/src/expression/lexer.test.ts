import { describe, expect, it } from 'vitest';
import { tokenize } from './lexer.js';

describe('tokenize', () => {
  it('tokenizes numbers, including decimals and exponents', () => {
    expect(tokenize('1')).toEqual([{ type: 'num', value: 1 }, { type: 'eof' }]);
    expect(tokenize('1.5')).toEqual([{ type: 'num', value: 1.5 }, { type: 'eof' }]);
    expect(tokenize('1e3')).toEqual([{ type: 'num', value: 1000 }, { type: 'eof' }]);
  });

  it('tokenizes single- and double-quoted strings with escapes', () => {
    expect(tokenize(`'a\\'b'`)).toEqual([{ type: 'str', value: "a'b" }, { type: 'eof' }]);
    expect(tokenize(`"a\\"b"`)).toEqual([{ type: 'str', value: 'a"b' }, { type: 'eof' }]);
    expect(tokenize(`"a\\nb"`)).toEqual([{ type: 'str', value: 'a\nb' }, { type: 'eof' }]);
    expect(tokenize(`"a\\tb"`)).toEqual([{ type: 'str', value: 'a\tb' }, { type: 'eof' }]);
    expect(tokenize(`"a\\rb"`)).toEqual([{ type: 'str', value: 'a\rb' }, { type: 'eof' }]);
  });

  it('throws on an unterminated string', () => {
    expect(() => tokenize(`"unterminated`)).toThrow(/Unterminated string/);
  });

  it('tokenizes $-prefixed and bare identifiers', () => {
    expect(tokenize('$json')).toEqual([{ type: 'ident', value: '$json' }, { type: 'eof' }]);
    expect(tokenize('$')).toEqual([{ type: 'ident', value: '$' }, { type: 'eof' }]);
    expect(tokenize('foo_bar1')).toEqual([{ type: 'ident', value: 'foo_bar1' }, { type: 'eof' }]);
  });

  it('prefers the longest punctuator match (=== over ==, ?. over ?)', () => {
    expect(tokenize('===').map((t) => t)).toEqual([{ type: 'punct', value: '===' }, { type: 'eof' }]);
    expect(tokenize('?.').map((t) => t)).toEqual([{ type: 'punct', value: '?.' }, { type: 'eof' }]);
  });

  it('skips whitespace between tokens', () => {
    expect(tokenize('  1   +   2  ')).toEqual([
      { type: 'num', value: 1 },
      { type: 'punct', value: '+' },
      { type: 'num', value: 2 },
      { type: 'eof' },
    ]);
  });

  it('tokenizes a template literal with one interpolation', () => {
    const tokens = tokenize('`hello ${$json.name}!`');
    expect(tokens).toHaveLength(2);
    const templateToken = tokens[0]!;
    if (templateToken.type !== 'template') throw new Error('expected template token');
    expect(templateToken.parts).toEqual([
      { type: 'str', value: 'hello ' },
      {
        type: 'expr',
        tokens: [
          { type: 'ident', value: '$json' },
          { type: 'punct', value: '.' },
          { type: 'ident', value: 'name' },
          { type: 'eof' },
        ],
      },
      { type: 'str', value: '!' },
    ]);
  });

  it('tokenizes a template literal with a nested object literal interpolation without truncating', () => {
    const tokens = tokenize('`${ {a: {b: 1}} }`');
    const templateToken = tokens[0]!;
    if (templateToken.type !== 'template') throw new Error('expected template token');
    // Leading/trailing empty quasis are always present around a lone interpolation.
    expect(templateToken.parts).toHaveLength(3);
    expect(templateToken.parts[0]).toEqual({ type: 'str', value: '' });
    expect(templateToken.parts[2]).toEqual({ type: 'str', value: '' });
    const exprPart = templateToken.parts[1]!;
    if (exprPart.type !== 'expr') throw new Error('expected expr part');
    expect(exprPart.tokens.filter((t) => t.type === 'punct' && t.value === '{')).toHaveLength(2);
  });

  it('does not miscount braces that appear inside a string literal within an interpolation', () => {
    const tokens = tokenize('`${ "a}b" }`');
    const templateToken = tokens[0]!;
    if (templateToken.type !== 'template') throw new Error('expected template token');
    const exprPart = templateToken.parts[1]!;
    if (exprPart.type !== 'expr') throw new Error('expected expr part');
    expect(exprPart.tokens).toEqual([{ type: 'str', value: 'a}b' }, { type: 'eof' }]);
  });

  it('processes escape sequences in the raw text of a template literal, outside any interpolation', () => {
    const tokens = tokenize('`a\\nb`');
    const templateToken = tokens[0]!;
    if (templateToken.type !== 'template') throw new Error('expected template token');
    expect(templateToken.parts).toEqual([{ type: 'str', value: 'a\nb' }]);
  });

  it('throws on an unterminated template literal', () => {
    expect(() => tokenize('`unterminated')).toThrow(/Unterminated template/);
  });

  it('throws on an unterminated interpolation', () => {
    expect(() => tokenize('`${ 1 + 2')).toThrow(/Unterminated template interpolation/);
  });

  it('throws on an unexpected character', () => {
    expect(() => tokenize('1 ; 2')).toThrow(/Unexpected character/);
  });
});
