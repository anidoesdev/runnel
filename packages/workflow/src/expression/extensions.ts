import { DateTime } from 'luxon';
import type { DateTimeUnit } from 'luxon';
import type { IDataObject } from '../interfaces/common.interfaces.js';

/**
 * Chainable methods on native types (`"foo".toSnakeCase()`, `[1,2].unique()`, ...). These are
 * resolved by a lookup keyed on the runtime value's category, not by patching
 * String.prototype/Array.prototype/etc. globally — see evaluator.ts's `evaluateCall`, which
 * checks this registry before falling back to a plain native method call.
 */
export type ExtensionCategory = 'string' | 'number' | 'array' | 'object' | 'datetime';
export type ExtensionFn = (target: unknown, args: unknown[]) => unknown;

function isPlainRecord(value: unknown): value is IDataObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !DateTime.isDateTime(value);
}

const stringExtensions: Record<string, ExtensionFn> = {
  toSnakeCase: (target) =>
    String(target)
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase(),
  extractEmail: (target) => {
    const match = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(String(target));
    return match ? match[0] : '';
  },
  isEmpty: (target) => String(target).length === 0,
  toDateTime: (target, args) => {
    const format = args[0] as string | undefined;
    const value = String(target);
    return format ? DateTime.fromFormat(value, format) : DateTime.fromISO(value);
  },
};

const arrayExtensions: Record<string, ExtensionFn> = {
  first: (target) => (target as unknown[])[0],
  last: (target) => {
    const arr = target as unknown[];
    return arr[arr.length - 1];
  },
  pluck: (target, args) => {
    const key = args[0] as string;
    return (target as IDataObject[]).map((entry) => entry[key]);
  },
  unique: (target, args) => {
    const key = args[0] as string | undefined;
    const seen = new Set<string>();
    const result: unknown[] = [];
    for (const entry of target as unknown[]) {
      const identity = JSON.stringify(key ? (entry as IDataObject)[key] : entry);
      if (!seen.has(identity)) {
        seen.add(identity);
        result.push(entry);
      }
    }
    return result;
  },
  sum: (target, args) => {
    const key = args[0] as string | undefined;
    return (target as unknown[]).reduce<number>((total, entry) => {
      const value = key ? (entry as IDataObject)[key] : entry;
      return total + (typeof value === 'number' ? value : 0);
    }, 0);
  },
  chunk: (target, args) => {
    const size = args[0] as number;
    const arr = target as unknown[];
    if (!Number.isInteger(size) || size <= 0) return [arr];
    const chunks: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  },
};

const objectExtensions: Record<string, ExtensionFn> = {
  keys: (target) => Object.keys(target as IDataObject),
  hasField: (target, args) => Object.prototype.hasOwnProperty.call(target as IDataObject, args[0] as string),
  removeFieldsContaining: (target, args) => {
    const substring = args[0] as string;
    const result: IDataObject = {};
    for (const [key, value] of Object.entries(target as IDataObject)) {
      if (!String(value).includes(substring)) result[key] = value;
    }
    return result;
  },
};

const numberExtensions: Record<string, ExtensionFn> = {
  format: (target, args) => {
    const locale = args[0] as string | undefined;
    return new Intl.NumberFormat(locale).format(target as number);
  },
  round: (target, args) => {
    const decimals = (args[0] as number | undefined) ?? 0;
    const factor = 10 ** decimals;
    return Math.round((target as number) * factor) / factor;
  },
};

const datetimeExtensions: Record<string, ExtensionFn> = {
  plus: (target, args) => (target as DateTime).plus({ [args[1] as string]: args[0] as number }),
  minus: (target, args) => (target as DateTime).minus({ [args[1] as string]: args[0] as number }),
  beginningOf: (target, args) => (target as DateTime).startOf(args[0] as DateTimeUnit),
  format: (target, args) => (target as DateTime).toFormat(args[0] as string),
};

const REGISTRY: Record<ExtensionCategory, Record<string, ExtensionFn>> = {
  string: stringExtensions,
  number: numberExtensions,
  array: arrayExtensions,
  object: objectExtensions,
  datetime: datetimeExtensions,
};

export function categoryOf(value: unknown): ExtensionCategory | undefined {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (DateTime.isDateTime(value)) return 'datetime';
  if (isPlainRecord(value)) return 'object';
  return undefined;
}

export function getExtension(value: unknown, methodName: string): ExtensionFn | undefined {
  const category = categoryOf(value);
  if (!category) return undefined;
  return REGISTRY[category][methodName];
}
