import { describe, expect, it } from 'vitest';
import { isPropertyVisible } from './displayOptions.js';
import type { INodeProperties } from '@n8n-clone/workflow';

const base: INodeProperties = { displayName: 'Value', name: 'value', type: 'string', default: '' };

describe('isPropertyVisible', () => {
  it('is visible when there are no displayOptions', () => {
    expect(isPropertyVisible(base, {})).toBe(true);
  });

  it('is visible only when every show condition matches', () => {
    const prop: INodeProperties = { ...base, displayOptions: { show: { mode: ['json'] } } };
    expect(isPropertyVisible(prop, { mode: 'json' })).toBe(true);
    expect(isPropertyVisible(prop, { mode: 'manual' })).toBe(false);
  });

  it('requires all show conditions to match when there are several', () => {
    const prop: INodeProperties = { ...base, displayOptions: { show: { mode: ['manual'], sendBody: [true] } } };
    expect(isPropertyVisible(prop, { mode: 'manual', sendBody: true })).toBe(true);
    expect(isPropertyVisible(prop, { mode: 'manual', sendBody: false })).toBe(false);
  });

  it('is hidden when a hide condition matches', () => {
    const prop: INodeProperties = { ...base, displayOptions: { hide: { advanced: [false] } } };
    expect(isPropertyVisible(prop, { advanced: false })).toBe(false);
    expect(isPropertyVisible(prop, { advanced: true })).toBe(true);
  });
});
