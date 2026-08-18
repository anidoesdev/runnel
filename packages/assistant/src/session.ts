import type { IModelMessage, IModelToolCallRef } from './model-provider.js';

export interface IAskUserQuestionOption {
  label: string;
  value: string;
  description?: string;
}

export interface IAskUserQuestion {
  id: string;
  question: string;
  options?: IAskUserQuestionOption[];
  allowFreeText?: boolean;
}

export interface IAssistantActor {
  userId: string;
  projectId?: string;
  scopes: string[];
}

export interface IAssistantTokenBudget {
  used: number;
  limit: number;
}

export type AssistantSessionStatus = 'idle' | 'thinking' | 'awaiting_user' | 'awaiting_approval' | 'error';

export interface IAssistantSession {
  id: string;
  workflowId: string;
  draftId: string;
  /** Full transcript including tool_use / tool_result — see IModelMessage. */
  messages: IModelMessage[];
  actor: IAssistantActor;
  tokenBudget: IAssistantTokenBudget;
  /**
   * Set when the loop pauses on an approval gate (remove_node, rename_node — see ITool.requiresApproval).
   * `remainingCalls` are the rest of that model turn's tool-call batch, not yet executed —
   * resumeApproval (agent-loop.ts) processes them in order once this one is decided, so a
   * multi-tool-call turn doesn't lose calls that came after the gated one.
   */
  pendingApproval?: { toolCallId: string; toolName: string; args: unknown; remainingCalls: IModelToolCallRef[] };
  /** Set when the loop pauses on an ask_user call — same "rest of the batch" contract as pendingApproval. Answers come back keyed by question id (see resumeAskUser). */
  pendingQuestions?: { toolCallId: string; questions: IAskUserQuestion[]; remainingCalls: IModelToolCallRef[] };
  status: AssistantSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export function createSession(params: {
  id: string;
  workflowId: string;
  draftId: string;
  actor: IAssistantActor;
  tokenLimit: number;
}): IAssistantSession {
  const now = new Date().toISOString();
  return {
    id: params.id,
    workflowId: params.workflowId,
    draftId: params.draftId,
    messages: [],
    actor: params.actor,
    tokenBudget: { used: 0, limit: params.tokenLimit },
    status: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * The only seam between this package and however sessions are actually persisted — mirrors
 * IWorkflowRepositoryPort in workflow-tools. "A user who reloads the page mid-build must not
 * lose the conversation" means resuming by re-fetching through this port, not by keeping any
 * process-local state; runTurn itself never touches storage (see agent-loop.ts) so the caller
 * is free to save after every turn, or after every event, without runTurn knowing which.
 */
export interface IAssistantSessionRepositoryPort {
  create(session: IAssistantSession): Promise<IAssistantSession>;
  get(sessionId: string): Promise<IAssistantSession | undefined>;
  save(session: IAssistantSession): Promise<IAssistantSession>;
}

/** In-memory only — a real (TypeORM-backed, following the exact pattern packages/cli would give IWorkflowRepositoryPort) implementation is a mechanical follow-up once there's an actual REST/SSE endpoint that needs one, same scoping call already made for workflow drafts in Milestone 1. */
export class InMemoryAssistantSessionStore implements IAssistantSessionRepositoryPort {
  private readonly sessions = new Map<string, IAssistantSession>();

  async create(session: IAssistantSession): Promise<IAssistantSession> {
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }

  async get(sessionId: string): Promise<IAssistantSession | undefined> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : undefined;
  }

  async save(session: IAssistantSession): Promise<IAssistantSession> {
    this.sessions.set(session.id, structuredClone(session));
    return structuredClone(session);
  }
}
