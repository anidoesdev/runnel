import { describe, expect, it } from 'vitest';
import { countJsonTokens } from './token-count.js';

describe('countJsonTokens', () => {
  it('returns a positive count for a non-trivial payload', () => {
    expect(countJsonTokens({ a: 1, b: 'hello world' })).toBeGreaterThan(0);
  });

  it('grows with payload size', () => {
    const small = countJsonTokens({ a: 1 });
    const large = countJsonTokens({ a: 1, b: 'x'.repeat(1000) });
    expect(large).toBeGreaterThan(small);
  });
});
