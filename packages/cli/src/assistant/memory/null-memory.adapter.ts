import type { IAssistantMemoryPort, IRecallResult } from '@n8n-clone/assistant';

/** The default: memory disabled. Recalls nothing, captures nothing, touches no storage. */
export class NullMemoryAdapter implements IAssistantMemoryPort {
  async recall(): Promise<IRecallResult> {
    return { memories: [], trace: null, tokensUsed: 0 };
  }

  async capture(): Promise<void> {}
}
