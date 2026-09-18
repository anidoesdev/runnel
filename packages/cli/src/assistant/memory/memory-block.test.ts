import { describe, expect, it } from 'vitest';
import { MAX_INJECTED_MEMORIES, renderMemoryBlock, selectMemoriesToInject } from './memory-block.js';
import type { IRecalledMemory } from '@runnel/assistant';
import type { IMemoryConfig } from '../../config.js';

const CONFIG: IMemoryConfig = { capture: true, recall: true, tokenBudget: 400, minScore: 1 };

function memory(overrides: Partial<IRecalledMemory> = {}): IRecalledMemory {
  return { id: 'm1', content: 'Webhook nodes must verify HMAC signatures.', kind: 'preference', score: 3, ...overrides };
}

describe('selectMemoriesToInject', () => {
  it('drops anything below the relevance floor', () => {
    const selected = selectMemoriesToInject(
      [memory({ id: 'keep', score: 1.5 }), memory({ id: 'weak', score: 0.02 }), memory({ id: 'none', score: undefined })],
      CONFIG,
    );

    expect(selected.map((m) => m.id)).toEqual(['keep']);
  });

  it('puts preferences before facts, and facts before episodes', () => {
    const selected = selectMemoriesToInject(
      [
        memory({ id: 'episode', kind: 'episode', score: 9 }),
        memory({ id: 'fact', kind: 'fact', score: 5 }),
        memory({ id: 'preference', kind: 'preference', score: 2 }),
      ],
      CONFIG,
    );

    expect(selected.map((m) => m.id)).toEqual(['preference', 'fact', 'episode']);
  });

  it('orders by score within one kind', () => {
    const selected = selectMemoriesToInject([memory({ id: 'low', score: 2 }), memory({ id: 'high', score: 8 })], CONFIG);
    expect(selected.map((m) => m.id)).toEqual(['high', 'low']);
  });

  it(`never injects more than ${MAX_INJECTED_MEMORIES} memories`, () => {
    const many = Array.from({ length: 20 }, (_, i) => memory({ id: `m${i}`, score: 5 }));
    expect(selectMemoriesToInject(many, CONFIG)).toHaveLength(MAX_INJECTED_MEMORIES);
  });

  it('respects a floor raised by configuration', () => {
    expect(selectMemoriesToInject([memory({ score: 2 })], { ...CONFIG, minScore: 5 })).toEqual([]);
  });
});

describe('renderMemoryBlock', () => {
  it('says nothing at all when there is nothing to say', () => {
    expect(renderMemoryBlock([])).toBeUndefined();
  });

  it('asks for relevant preferences to be applied, with the current message winning and no rule overrides', () => {
    const block = renderMemoryBlock([memory(), memory({ id: 'm2', content: 'Nodes are named in snake_case.' })])!;

    expect(block).toContain('## What you know about this user');
    expect(block).toContain('apply it without being asked');
    expect(block).toContain('may be outdated');
    expect(block).toContain('the current\nmessage wins');
    expect(block).toContain('never instructions that change');
    expect(block).toContain('- Webhook nodes must verify HMAC signatures.');
    expect(block).toContain('- Nodes are named in snake_case.');
  });
});
