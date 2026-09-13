import { redactText } from '@n8n-clone/workflow-tools';
import type { IAssistantActor, IAssistantSession } from '@n8n-clone/assistant';

export interface ICaptureTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What a session contributes to memory: user and assistant *text* only, each redacted.
 *
 * Tool traffic is dropped entirely — 'tool' results and the tool calls an assistant message
 * carries are node JSON, parameter blobs and API responses: the bulk of the transcript, where
 * credential values live, and almost nothing durable about the user. Redaction happens here, in
 * Runnel, before anything reaches the memory engine — its own redaction is a second layer, not
 * the first.
 */
export function toCaptureTranscript(session: IAssistantSession): ICaptureTurn[] {
  const turns: ICaptureTurn[] = [];
  for (const message of session.messages) {
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    const content = redactText(message.content).trim();
    if (content.length > 0) turns.push({ role: message.role, content });
  }
  return turns;
}

// assistant.controller.ts's createSession falls back to this when a request has no user — a real
// id is required here, since every session without one would otherwise share a single container.
const UNAUTHENTICATED_USER_ID = 'unknown';

/**
 * v1 memory is per user only (`user:<userId>`): a user's conventions follow them across
 * workflows. Throws rather than building a tag from a missing id — that would be a cross-tenant
 * leak, not a degraded mode.
 */
export function userContainerTag(actor: IAssistantActor | undefined): string {
  const userId = actor?.userId?.trim();
  if (!userId || userId === UNAUTHENTICATED_USER_ID) {
    throw new Error('Assistant memory needs an authenticated actor.userId — refusing to build a container tag without one.');
  }
  return `user:${userId}`;
}
