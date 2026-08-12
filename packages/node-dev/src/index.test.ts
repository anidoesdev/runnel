import { describe, expect, it } from 'vitest';
import { validateNodeName } from './index.js';

describe('validateNodeName', () => {
  it('accepts camelCase node names', () => {
    expect(validateNodeName('httpRequest')).toBe(true);
  });

  it('rejects names starting with a capital or containing spaces', () => {
    expect(validateNodeName('HttpRequest')).toBe(false);
    expect(validateNodeName('http request')).toBe(false);
  });
});
