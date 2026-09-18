import type { IMemoryConfig } from '../../config.js';
import type { IRecalledMemory } from '@runnel/assistant';

// The wording lives with the prompt it extends; the eval harness renders the exact same block.
export { renderMemoryBlock } from '@runnel/assistant';

/**
 * Preferences first: they are the ones that should change what the assistant builds. Facts are
 * context, and episodes ("the user hit an error last Tuesday") are the least likely to still be
 * true, so they go last and are the first to fall off the end of a truncated list.
 */
const KIND_ORDER: Record<IRecalledMemory['kind'], number> = { preference: 0, fact: 1, episode: 2 };

/** At most this many memories reach the prompt, however many clear the relevance floor. */
export const MAX_INJECTED_MEMORIES = 8;

/**
 * Drops anything below the configured relevance floor, then orders what's left by kind and
 * score. The floor matters more than it sounds: keyword recall returns a hit for almost every
 * message, and an unfiltered list would put one workflow's details into every other workflow.
 */
export function selectMemoriesToInject(memories: IRecalledMemory[], config: IMemoryConfig): IRecalledMemory[] {
  return memories
    .filter((memory) => (memory.score ?? 0) >= config.minScore)
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_INJECTED_MEMORIES);
}
