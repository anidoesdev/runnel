import { describe, expect, it } from 'vitest';
import {
  renameNodeReferencesInExpression,
  renameNodeReferencesInParameters,
} from './expression-reference-rewriter.js';

describe('renameNodeReferencesInExpression', () => {
  it('rewrites $node["Name"] double-quoted references', () => {
    expect(renameNodeReferencesInExpression('{{ $node["Old"].json.x }}', 'Old', 'New')).toBe(
      '{{ $node["New"].json.x }}',
    );
  });

  it("rewrites $node['Name'] single-quoted references", () => {
    expect(renameNodeReferencesInExpression("{{ $node['Old'].json.x }}", 'Old', 'New')).toBe(
      "{{ $node['New'].json.x }}",
    );
  });

  it('rewrites $("Name") call-style references', () => {
    expect(renameNodeReferencesInExpression('{{ $("Old").item.json.x }}', 'Old', 'New')).toBe(
      '{{ $("New").item.json.x }}',
    );
  });

  it("rewrites $('Name') call-style single-quoted references", () => {
    expect(renameNodeReferencesInExpression("{{ $('Old').item.json.x }}", 'Old', 'New')).toBe(
      "{{ $('New').item.json.x }}",
    );
  });

  it('rewrites every occurrence when a node is referenced multiple times', () => {
    const expr = '{{ $node["Old"].json.a + $node["Old"].json.b }}';
    expect(renameNodeReferencesInExpression(expr, 'Old', 'New')).toBe(
      '{{ $node["New"].json.a + $node["New"].json.b }}',
    );
  });

  it('leaves references to other node names untouched', () => {
    const expr = '{{ $node["Other"].json.x }}';
    expect(renameNodeReferencesInExpression(expr, 'Old', 'New')).toBe(expr);
  });

  it('does not stop at an escaped quote inside the node name', () => {
    const expr = `{{ $node["Bob's \\"favorite\\" node"].json.x }}`;
    expect(renameNodeReferencesInExpression(expr, `Bob's "favorite" node`, 'Bob')).toBe(
      '{{ $node["Bob"].json.x }}',
    );
  });

  it('re-escapes the new name when it contains the delimiter quote', () => {
    const expr = '{{ $node["Old"].json.x }}';
    expect(renameNodeReferencesInExpression(expr, 'Old', 'New "Two" Words')).toBe(
      '{{ $node["New \\"Two\\" Words"].json.x }}',
    );
  });

  it('does not touch a mismatched reference shape (e.g. $node(...) or $["..."])', () => {
    const expr = '{{ $node("Old") }} {{ $["Old"] }}';
    expect(renameNodeReferencesInExpression(expr, 'Old', 'New')).toBe(expr);
  });
});

describe('renameNodeReferencesInParameters', () => {
  it('only rewrites strings that begin with "=" (expression-enabled)', () => {
    const params = {
      expr: '={{ $node["Old"].json.x }}',
      literal: '$node["Old"].json.x is not an expression',
    };
    const result = renameNodeReferencesInParameters(params, 'Old', 'New');

    expect(result.expr).toBe('={{ $node["New"].json.x }}');
    expect(result.literal).toBe(params.literal);
  });

  it('recurses into nested objects and arrays', () => {
    const params = {
      collection: {
        values: [{ value: '={{ $node["Old"].json.x }}' }, { value: 'plain' }],
      },
    };
    const result = renameNodeReferencesInParameters(params, 'Old', 'New') as typeof params;

    expect(result.collection.values[0]!.value).toBe('={{ $node["New"].json.x }}');
    expect(result.collection.values[1]!.value).toBe('plain');
  });

  it('leaves non-string primitives untouched', () => {
    const params = { count: 3, enabled: true, nothing: null };
    expect(renameNodeReferencesInParameters(params, 'Old', 'New')).toEqual(params);
  });
});
