import { createSession, resumeApproval, resumeAskUser, runTurn } from '@n8n-clone/assistant';
import { createToolRegistry, WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { Get, Post, RestController } from '../http/decorators.js';
import { NotFoundError } from '../http/http-errors.js';
import { generateId } from '../db/id.js';
import { createAssistantSessionSchema, resumeApprovalSchema, resumeAskUserSchema, sendAssistantMessageSchema } from './assistant.dto.js';
import { CredentialRepositoryAdapter } from './credential-repository.adapter.js';
import { createModelProviderForSession } from './model-provider.factory.js';
import { startSseResponse, writeSseEvent } from './sse.js';
import type { AuthenticatedRequest } from '../auth/auth.middleware.js';
import type { IAssistantSession, IAssistantSessionRepositoryPort, IRunTurnDeps, IRunTurnOptions } from '@n8n-clone/assistant';
import type { INodeTypes } from '@n8n-clone/core';
import type { Request, Response } from 'express';
import type { Repository } from 'typeorm';
import type { Logger } from 'pino';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

const DEFAULT_TOKEN_LIMIT = 200_000;

/**
 * The REST/SSE surface for the Workflow Assistant — the `server/assistant/session.ts` box from
 * the build prompt's architecture diagram, minus the agent loop itself (that's
 * @n8n-clone/assistant; this controller only wires it to HTTP). Every mutating route resolves
 * to a streamed turn: it loads the session, builds fresh deps (a new model provider + tool
 * context per call — cheap, and avoids holding a live OpenAI connection open between requests),
 * runs the loop with `onEvent` writing straight to the SSE response, and persists whatever
 * state the loop ended up in — success, a pause, or an error — before closing the stream.
 */
@RestController('/rest/assistant')
export class AssistantController {
  constructor(
    private readonly sessions: IAssistantSessionRepositoryPort,
    private readonly draftStore: WorkflowDraftStore,
    private readonly credentials: Repository<CredentialEntity>,
    private readonly nodeTypes: INodeTypes,
    private readonly encryptionKey: string,
    private readonly logger: Logger,
  ) {}

  @Post('/sessions')
  async createSession(req: Request): Promise<IAssistantSession> {
    const parsed = createAssistantSessionSchema.parse(req.body);
    const userId = (req as Partial<AuthenticatedRequest>).user?.id ?? 'unknown';

    const draft = await this.draftStore.open(parsed.workflowId);
    const session = createSession({
      id: generateId(),
      workflowId: parsed.workflowId,
      draftId: draft.id,
      actor: { userId, scopes: [] },
      tokenLimit: parsed.tokenLimit ?? DEFAULT_TOKEN_LIMIT,
    });
    return this.sessions.create(session);
  }

  @Get('/sessions/:id')
  async getSession(req: Request): Promise<IAssistantSession> {
    return this.findSessionOrThrow(String(req.params.id));
  }

  @Get('/sessions/:id/diff')
  async getDiff(req: Request) {
    const session = await this.findSessionOrThrow(String(req.params.id));
    return this.draftStore.diff(session.draftId);
  }

  /** The draft's current full nodes/connections — what the canvas renders as a live preview while the assistant is building, per Part 6's "highlight on the canvas in real time". */
  @Get('/sessions/:id/draft')
  async getDraft(req: Request) {
    const session = await this.findSessionOrThrow(String(req.params.id));
    return this.draftStore.get(session.draftId).current;
  }

  /** Rule #2: the agent never applies its own draft — this is the explicit, user-initiated action that finally writes it to the live workflow. */
  @Post('/sessions/:id/apply')
  async applyDraft(req: Request) {
    const session = await this.findSessionOrThrow(String(req.params.id));
    return this.draftStore.apply(session.draftId);
  }

  @Post('/sessions/:id/messages')
  async sendMessage(req: Request, res: Response): Promise<void> {
    const parsed = sendAssistantMessageSchema.parse(req.body);
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.streamTurn(res, session, (deps, options) => runTurn(session, parsed.message, deps, options));
  }

  @Post('/sessions/:id/approval')
  async submitApproval(req: Request, res: Response): Promise<void> {
    const parsed = resumeApprovalSchema.parse(req.body);
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.streamTurn(res, session, (deps, options) => resumeApproval(session, parsed.decision, deps, options));
  }

  @Post('/sessions/:id/answers')
  async submitAnswers(req: Request, res: Response): Promise<void> {
    const parsed = resumeAskUserSchema.parse(req.body);
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.streamTurn(res, session, (deps, options) => resumeAskUser(session, parsed.answers, deps, options));
  }

  private async findSessionOrThrow(id: string): Promise<IAssistantSession> {
    const session = await this.sessions.get(id);
    if (!session) throw new NotFoundError(`Assistant session "${id}" not found`);
    return session;
  }

  /**
   * Shared by every route that runs (or resumes) a turn. Resolving the model provider happens
   * *before* the SSE headers go out, so a missing OpenAI credential surfaces as a normal JSON
   * error response — not a stream that opens and immediately breaks. `res` closing (the client
   * navigating away, the tab closing) aborts the in-flight turn via the same AbortSignal the
   * loop already threads through the model call and every tool call.
   */
  private async streamTurn(
    res: Response,
    session: IAssistantSession,
    run: (deps: IRunTurnDeps, options: IRunTurnOptions) => Promise<IAssistantSession>,
  ): Promise<void> {
    const modelProvider = await createModelProviderForSession(this.credentials, this.encryptionKey);
    const deps: IRunTurnDeps = {
      modelProvider,
      tools: createToolRegistry(),
      toolContext: {
        draftId: session.draftId,
        nodeTypes: this.nodeTypes,
        draftStore: this.draftStore,
        credentials: new CredentialRepositoryAdapter(this.credentials, this.encryptionKey),
      },
    };

    startSseResponse(res);
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      const finished = await run(deps, { signal: controller.signal, onEvent: (event) => writeSseEvent(res, event) });
      await this.sessions.save(finished);
    } catch (err) {
      this.logger.error({ err, sessionId: session.id }, 'Assistant turn failed');
      writeSseEvent(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      await this.sessions.save(session);
    } finally {
      res.end();
    }
  }
}
