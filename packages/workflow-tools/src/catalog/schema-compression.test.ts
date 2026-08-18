import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@n8n-clone/core';
import { registerAllNodeTypes } from '@n8n-clone/nodes-base';
import { compressNodeSchema, getFieldOptions } from './schema-compression.js';
import { countJsonTokens } from './token-count.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

function description(overrides: Partial<INodeTypeDescription>): INodeTypeDescription {
  return {
    displayName: 'Test Node',
    name: 'test.node',
    group: ['transform'],
    version: 1,
    description: 'A test node',
    defaults: { name: 'Test Node' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    ...overrides,
  };
}

describe('compressNodeSchema', () => {
  it('keeps required-ness, defaults, and drops raw displayOptions rule objects', () => {
    const schema = compressNodeSchema(
      description({
        credentials: [{ name: 'httpBasicAuth' }],
        properties: [{ displayName: 'URL', name: 'url', type: 'string', default: '', required: true }],
      }),
    );

    expect(schema.properties).toEqual([{ name: 'url', displayName: 'URL', type: 'string', required: true, default: '' }]);
    expect(schema.credentials).toEqual(['httpBasicAuth']);
    expect((schema.properties[0] as unknown as { displayOptions?: unknown }).displayOptions).toBeUndefined();
  });

  it('drops a hidden property entirely', () => {
    const schema = compressNodeSchema(
      description({ properties: [{ displayName: 'Internal', name: 'internal', type: 'hidden', default: '' }] }),
    );
    expect(schema.properties).toEqual([]);
  });

  it('inlines a short options enum', () => {
    const schema = compressNodeSchema(
      description({
        properties: [
          {
            displayName: 'Mode',
            name: 'mode',
            type: 'options',
            default: 'a',
            options: [
              { name: 'A', value: 'a' },
              { name: 'B', value: 'b' },
            ],
          },
        ],
      }),
    );
    expect(schema.properties[0]!.options).toEqual([{ name: 'A', value: 'a' }, { name: 'B', value: 'b' }]);
    expect(schema.properties[0]!.optionsTruncated).toBeUndefined();
  });

  it('truncates an options enum over 30 entries instead of inlining it', () => {
    const bigOptions = Array.from({ length: 40 }, (_, i) => ({ name: `Option ${i}`, value: `opt${i}` }));
    const schema = compressNodeSchema(
      description({ properties: [{ displayName: 'Country', name: 'country', type: 'options', default: 'opt0', options: bigOptions }] }),
    );
    expect(schema.properties[0]!.options).toBeUndefined();
    expect(schema.properties[0]!.optionsTruncated).toBe(true);
  });

  it('drops a property whose displayOptions.show rules it out for the given currentParameters', () => {
    const nodeDescription = description({
      properties: [
        { displayName: 'Mode', name: 'mode', type: 'options', default: 'manual', options: [{ name: 'Manual', value: 'manual' }, { name: 'JSON', value: 'json' }] },
        { displayName: 'Fields', name: 'fields', type: 'fixedCollection', default: {}, displayOptions: { show: { mode: ['manual'] } } },
        { displayName: 'JSON', name: 'jsonOutput', type: 'json', default: '{}', displayOptions: { show: { mode: ['json'] } } },
      ],
    });

    const jsonMode = compressNodeSchema(nodeDescription, { mode: 'json' });
    expect(jsonMode.properties.map((p) => p.name)).toEqual(['mode', 'jsonOutput']);

    const manualMode = compressNodeSchema(nodeDescription, { mode: 'manual' });
    expect(manualMode.properties.map((p) => p.name)).toEqual(['mode', 'fields']);
  });

  it('includes every property (no filtering) when currentParameters is omitted', () => {
    const nodeDescription = description({
      properties: [
        { displayName: 'Mode', name: 'mode', type: 'options', default: 'manual', options: [] },
        { displayName: 'Fields', name: 'fields', type: 'fixedCollection', default: {}, displayOptions: { show: { mode: ['manual'] } } },
        { displayName: 'JSON', name: 'jsonOutput', type: 'json', default: '{}', displayOptions: { show: { mode: ['json'] } } },
      ],
    });
    expect(compressNodeSchema(nodeDescription).properties.map((p) => p.name)).toEqual(['mode', 'fields', 'jsonOutput']);
  });

  it('attaches the hand-authored usage example for a real registered node type, and omits it when there is none', () => {
    const catalog = registerAllNodeTypes(new MapNodeTypes());
    const httpSchema = compressNodeSchema(catalog.getByNameAndVersion('httpRequest').description);
    expect(httpSchema.example).toBeDefined();

    const noOpSchema = compressNodeSchema(catalog.getByNameAndVersion('noOp').description);
    expect(noOpSchema.example).toBeUndefined();
  });
});

describe('getFieldOptions', () => {
  it('returns the full option list for an options field', () => {
    const options = getFieldOptions(
      description({ properties: [{ displayName: 'Mode', name: 'mode', type: 'options', default: 'a', options: [{ name: 'A', value: 'a', description: 'first' }] }] }),
      'mode',
    );
    expect(options).toEqual([{ name: 'A', value: 'a', description: 'first' }]);
  });

  it('throws for a field that does not exist on the node type', () => {
    expect(() => getFieldOptions(description({}), 'nope')).toThrow(/has no property "nope"/);
  });

  it('throws for a field that has no selectable options', () => {
    expect(() =>
      getFieldOptions(description({ properties: [{ displayName: 'URL', name: 'url', type: 'string', default: '' }] }), 'url'),
    ).toThrow(/has no selectable options/);
  });
});

describe('token budget — Milestone 2\'s own bar: every real node schema stays under 1500 tokens', () => {
  const catalog = registerAllNodeTypes(new MapNodeTypes());

  it.each(catalog.list().map((d) => d.name))('%s', (typeName) => {
    const schema = compressNodeSchema(catalog.getByNameAndVersion(typeName).description);
    const tokens = countJsonTokens(schema);
    expect(tokens).toBeLessThan(1500);
  });
});
