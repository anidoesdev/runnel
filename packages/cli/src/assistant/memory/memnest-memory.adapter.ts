import { scopeOf } from '@memnest/core';
import { redactText } from '@n8n-clone/workflow-tools';
import { toCaptureTranscript, userContainerTag } from './capture-transcript.js';
import type { Memnest } from '@memnest/core';
import type { IAssistantActor, IAssistantMemoryPort, IAssistantSession, IRecallResult } from '@n8n-clone/assistant';

/** The slice of Memnest this adapter uses — narrow so tests can hand it a spy. */
export type IMemnestForAssistant = Pick<Memnest, 'add' | 'search'>;

export class MemnestMemoryAdapter implements IAssistantMemoryPort {
  constructor(private readonly memnest: IMemnestForAssistant) {}

  async recall(query: string, actor: IAssistantActor, tokenBudget: number): Promise<IRecallResult> {
    const scope = scopeOf(userContainerTag(actor));
    // search() also packs raw transcript chunks into whatever budget memories leave over; only
    // extracted memories are used, so only their tokens are reported.
    const response = await this.memnest.search(redactText(query), scope, { tokenBudget });
    return {
      memories: response.memories.map(({ memory }) => ({ id: memory.id, content: memory.content, kind: memory.kind })),
      trace: response.trace,
      tokensUsed: response.memories.reduce((sum, result) => sum + result.tokens, 0),
    };
  }

  async capture(session: IAssistantSession): Promise<void> {
    const containerTag = userContainerTag(session.actor);
    const content = toCaptureTranscript(session);
    if (content.length === 0) return;

    // customId: a session is captured again every turn as it grows — Memnest versions the
    // document under this id and skips re-ingest when the content hash is unchanged. 'batched'
    // extraction waits for the session to go quiet instead of extracting after every turn.
    await this.memnest.add({
      containerTag,
      customId: session.id,
      content,
      metadata: { workflowId: session.workflowId, draftId: session.draftId },
      extraction: 'batched',
    });
  }
}
