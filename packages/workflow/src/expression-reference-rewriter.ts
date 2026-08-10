import type { IDataObject } from './interfaces/common.interfaces.js';

/**
 * Rewrites `$node["Name"]` / `$node['Name']` and `$("Name")` / `$('Name')` references to a
 * renamed node inside expression strings. Node names are matched with a scoped tokenizer
 * (not a blanket regex over the whole string) so that a node name containing quotes,
 * brackets, or text that merely looks like another expression doesn't get mangled — the
 * capture group runs up to the *matching unescaped* quote, honoring `\"`/`\'` escapes.
 */
const NODE_BRACKET_REF = /\$node\[(['"])((?:\\.|(?!\1)[\s\S])*)\1\]/g;
const NODE_CALL_REF = /\$\((['"])((?:\\.|(?!\1)[\s\S])*)\1\)/g;

function unescapeQuoted(raw: string): string {
  return raw.replace(/\\(.)/g, '$1');
}

function escapeForQuote(value: string, quote: string): string {
  return value.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), `\\${quote}`);
}

export function renameNodeReferencesInExpression(
  expression: string,
  oldName: string,
  newName: string,
): string {
  const rewrite = (head: string, closer: string) => (
    match: string,
    quote: string,
    rawName: string,
  ): string => {
    if (unescapeQuoted(rawName) !== oldName) return match;
    return `${head}${quote}${escapeForQuote(newName, quote)}${quote}${closer}`;
  };

  let result = expression.replace(NODE_BRACKET_REF, rewrite('$node[', ']'));
  result = result.replace(NODE_CALL_REF, rewrite('$(', ')'));
  return result;
}

/**
 * Recursively walks a node's `parameters` object and rewrites node references inside
 * every expression-enabled string (a string parameter is only evaluated as an expression
 * when its raw value begins with "=" — plain strings are left untouched even if they
 * happen to contain matching text).
 */
export function renameNodeReferencesInParameters(
  parameters: IDataObject,
  oldName: string,
  newName: string,
): IDataObject {
  const transform = (value: IDataObject[string]): IDataObject[string] => {
    if (typeof value === 'string') {
      if (!value.startsWith('=')) return value;
      return renameNodeReferencesInExpression(value, oldName, newName);
    }
    if (Array.isArray(value)) {
      return value.map((entry) => transform(entry) as IDataObject);
    }
    if (value && typeof value === 'object') {
      const result: IDataObject = {};
      for (const [key, entry] of Object.entries(value)) {
        result[key] = transform(entry);
      }
      return result;
    }
    return value;
  };

  return transform(parameters) as IDataObject;
}
