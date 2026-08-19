import { NotFoundError } from '../http/http-errors.js';
import type { IAssistantSession, IAssistantSessionRepositoryPort } from '@n8n-clone/assistant';
import type { Repository } from 'typeorm';
import type { AssistantSessionEntity } from '../db/entities/AssistantSession.entity.js';

function toEntityFields(session: IAssistantSession): Omit<AssistantSessionEntity, never> {
  return {
    id: session.id,
    workflowId: session.workflowId,
    draftId: session.draftId,
    messages: session.messages,
    actor: session.actor,
    tokenBudget: session.tokenBudget,
    pendingApproval: session.pendingApproval ?? null,
    pendingQuestions: session.pendingQuestions ?? null,
    status: session.status,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function toSession(entity: AssistantSessionEntity): IAssistantSession {
  return {
    id: entity.id,
    workflowId: entity.workflowId,
    draftId: entity.draftId,
    messages: entity.messages,
    actor: entity.actor,
    tokenBudget: entity.tokenBudget,
    pendingApproval: (entity.pendingApproval ?? undefined) as IAssistantSession['pendingApproval'],
    pendingQuestions: (entity.pendingQuestions ?? undefined) as IAssistantSession['pendingQuestions'],
    status: entity.status as IAssistantSession['status'],
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

/** TypeORM-backed IAssistantSessionRepositoryPort — this is what "a user who reloads mid-build must not lose the conversation" actually resolves to: the transcript, token budget, and any pending approval/question survive a process restart even though the draft itself (WorkflowDraftStore) does not — see the package README-level note in agent-loop.ts's session.ts for that scoping call. */
export class AssistantSessionRepositoryAdapter implements IAssistantSessionRepositoryPort {
  constructor(private readonly sessions: Repository<AssistantSessionEntity>) {}

  async create(session: IAssistantSession): Promise<IAssistantSession> {
    const entity = this.sessions.create(toEntityFields(session));
    const saved = await this.sessions.save(entity);
    return toSession(saved);
  }

  async get(sessionId: string): Promise<IAssistantSession | undefined> {
    const entity = await this.sessions.findOneBy({ id: sessionId });
    return entity ? toSession(entity) : undefined;
  }

  async save(session: IAssistantSession): Promise<IAssistantSession> {
    const entity = await this.sessions.findOneBy({ id: session.id });
    if (!entity) throw new NotFoundError(`Assistant session "${session.id}" not found`);
    Object.assign(entity, toEntityFields(session));
    const saved = await this.sessions.save(entity);
    return toSession(saved);
  }
}
