import type { IDataObject, INodeExecutionData } from '@runnel/workflow';

export interface SchemaField {
  path: string;
  type: string;
}

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Flattens each item's `json` into dot/bracket-notation field paths with an inferred type
 * (e.g. `user.name: string`, `tags[0]: string`), the shape a schema view expects. Fields are
 * deduplicated by path across all items — the type of the first occurrence wins.
 */
export function inferSchema(items: INodeExecutionData[]): SchemaField[] {
  const seen = new Map<string, string>();

  function walk(value: unknown, path: string): void {
    const type = typeOf(value);
    if (type === 'object') {
      const entries = Object.entries(value as IDataObject);
      if (entries.length === 0) {
        if (path && !seen.has(path)) seen.set(path, type);
        return;
      }
      for (const [key, v] of entries) walk(v, path ? `${path}.${key}` : key);
    } else if (type === 'array') {
      const arr = value as unknown[];
      if (arr.length === 0) {
        if (path && !seen.has(path)) seen.set(path, type);
        return;
      }
      arr.forEach((v, index) => walk(v, `${path}[${index}]`));
    } else if (!seen.has(path)) {
      seen.set(path, type);
    }
  }

  for (const item of items) walk(item.json, '');

  return [...seen.entries()].map(([path, type]) => ({ path, type }));
}

/** Top-level keys across all items, in first-seen order — used as table columns. */
export function tableColumns(items: INodeExecutionData[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const key of Object.keys(item.json)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

/** Renders a single table cell: primitives print as-is, objects/arrays as compact JSON, a missing key as blank. */
export function tableCell(item: INodeExecutionData, column: string): string {
  const value = (item.json as IDataObject)[column];
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
