import type { IAssistantActor, IAssistantSession } from './session.js';

export interface IRecalledMemory {
  id: string;
  content: string;
  kind: 'fact' | 'preference' | 'episode';
}

export interface IRecallResult {
  memories: IRecalledMemory[];
  /** The memory engine's own recall trace, opaque here. Logged, never sent to the model. */
  trace: unknown;
  tokensUsed: number;
}

/**
 * Cross-session memory for the assistant — the same ports-and-adapters seam as
 * IAssistantSessionRepositoryPort. This package only declares it: packages/cli supplies the
 * implementation (a no-op by default, Memnest when enabled), so nothing here ever depends on a
 * memory engine and the loop stays testable with a fake.
 */
export interface IAssistantMemoryPort {
  recall(query: string, actor: IAssistantActor, tokenBudget: number): Promise<IRecallResult>;
  /** Called repeatedly as a session grows — implementations must make re-capture idempotent. */
  capture(session: IAssistantSession): Promise<void>;
}
