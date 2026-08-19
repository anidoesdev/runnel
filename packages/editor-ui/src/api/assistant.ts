import { api, ApiError } from './http.js';
import type { AgentLoopEvent, IAssistantSessionRecord, IDraftWorkflow, IWorkflowDraftDiff } from './types.js';

interface IErrorBody {
  message?: string;
}

/**
 * SSE consumption, not `api`'s JSON request wrapper — the assistant's streaming routes send a
 * sequence of `data: {...}\n\n` frames, one per AgentLoopEvent, ending when the response closes
 * (no `[DONE]` sentinel; the server just ends the stream). Mirrors the same parsing logic
 * packages/assistant's own SSE parser uses to read OpenAI's stream — duplicated rather than
 * shared, since that package pulls in Node-only modules (`node:fs`) editor-ui's Vite bundle
 * can't take as a dependency.
 */
async function streamSse(
  path: string,
  body: unknown,
  onEvent: (event: AgentLoopEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/rest${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const contentType = res.headers.get('content-type') ?? '';
    const errorBody: unknown = contentType.includes('application/json') ? await res.json() : undefined;
    const message =
      errorBody && typeof errorBody === 'object' && 'message' in errorBody
        ? String((errorBody as IErrorBody).message)
        : res.statusText;
    throw new ApiError(res.status, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      for (const line of event.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (data.length > 0) onEvent(JSON.parse(data) as AgentLoopEvent);
      }
    }
  }
}

export const assistantApi = {
  createSession: (workflowId: string, tokenLimit?: number): Promise<IAssistantSessionRecord> =>
    api.post('/assistant/sessions', { workflowId, tokenLimit }),
  getSession: (id: string): Promise<IAssistantSessionRecord> => api.get(`/assistant/sessions/${id}`),
  getDiff: (id: string): Promise<IWorkflowDraftDiff> => api.get(`/assistant/sessions/${id}/diff`),
  getDraft: (id: string): Promise<IDraftWorkflow> => api.get(`/assistant/sessions/${id}/draft`),
  applyDraft: (id: string): Promise<IDraftWorkflow> => api.post(`/assistant/sessions/${id}/apply`),
  sendMessage: (id: string, message: string, onEvent: (event: AgentLoopEvent) => void, signal?: AbortSignal): Promise<void> =>
    streamSse(`/assistant/sessions/${id}/messages`, { message }, onEvent, signal),
  submitApproval: (
    id: string,
    decision: 'approve' | 'reject',
    onEvent: (event: AgentLoopEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => streamSse(`/assistant/sessions/${id}/approval`, { decision }, onEvent, signal),
  submitAnswers: (
    id: string,
    answers: Record<string, string>,
    onEvent: (event: AgentLoopEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => streamSse(`/assistant/sessions/${id}/answers`, { answers }, onEvent, signal),
};
