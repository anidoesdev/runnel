import { createSession, resumeApproval, resumeAskUser, runTurn } from '@n8n-clone/assistant';
import { createToolRegistry, redactText, WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { Get, Post, RestController } from '../http/decorators.js';
import { NotFoundError } from '../http/http-errors.js';
import { generateId } from '../db/id.js';
import { createAssistantSessionSchema, resumeApprovalSchema, resumeAskUserSchema, sendAssistantMessageSchema } from './assistant.dto.js';
import { CredentialRepositoryAdapter } from './credential-repository.adapter.js';
import { ExecutionAdapter } from './execution-adapter.js';
import { createModelProviderForSession } from './model-provider.factory.js';
import { startSseResponse, writeSseEvent } from './sse.js';
import { disabledAssistantMemory } from './memory/memory.factory.js';
import type { IAssistantMemory } from './memory/memory.factory.js';
import type { AuthenticatedRequest } from '../auth/auth.middleware.js';
import type { IAssistantSession, IAssistantSessionRepositoryPort, IRunTurnDeps, IRunTurnOptions } from '@n8n-clone/assistant';
import type { ICredentialTypes, INodeTypes } from '@n8n-clone/core';
import type { Request, Response } from 'express';
import type { Repository } from 'typeorm';
import type { Logger } from 'pino';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { UserEntity } from '../db/entities/User.entity.js';

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
    private readonly credentialTypes: ICredentialTypes,
    private readonly encryptionKey: string,
    private readonly logger: Logger,
    private readonly users: Repository<UserEntity>,
    private readonly memory: IAssistantMemory = disabledAssistantMemory(),
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
      // Explicit request wins, then the user's own settings-page default, then the server's.
      tokenLimit: parsed.tokenLimit ?? (await this.userTokenLimit(userId)) ?? DEFAULT_TOKEN_LIMIT,
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
    await this.ensureDraft(session);
    return this.draftStore.diff(session.draftId);
  }

  /** The draft's current full nodes/connections — what the canvas renders as a live preview while the assistant is building, per Part 6's "highlight on the canvas in real time". */
  @Get('/sessions/:id/draft')
  async getDraft(req: Request) {
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.ensureDraft(session);
    return this.draftStore.get(session.draftId).current;
  }

  /** Rule #2: the agent never applies its own draft — this is the explicit, user-initiated action that finally writes it to the live workflow. */
  @Post('/sessions/:id/apply')
  async applyDraft(req: Request) {
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.ensureDraft(session);
    return this.draftStore.apply(session.draftId);
  }

  @Post('/sessions/:id/messages')
  async sendMessage(req: Request, res: Response): Promise<void> {
    const parsed = sendAssistantMessageSchema.parse(req.body);
    const session = await this.findSessionOrThrow(String(req.params.id));
    await this.recallInShadow(session, parsed.message);
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

  private async userTokenLimit(userId: string): Promise<number | undefined> {
    const user = await this.users.findOneBy({ id: userId });
    return user?.settings?.assistant?.tokenLimit;
  }

  private async findSessionOrThrow(id: string): Promise<IAssistantSession> {
    const session = await this.sessions.get(id);
    if (!session) throw new NotFoundError(`Assistant session "${id}" not found`);
    return session;
  }

  /**
   * WorkflowDraftStore is in-memory only (see its own doc comment) — a session created before
   * the last server restart still remembers a `draftId` that no longer exists in this fresh
   * process. Rather than every draft-touching route failing with a raw "No open draft" error,
   * self-heal: open a new draft against the currently saved workflow, point the session at it,
   * and leave a note in the transcript so the conversation continues instead of dead-ending —
   * anything that was only in the old (unapplied) draft is unrecoverable either way, so a fresh
   * start from the live workflow is the best available outcome, not a partial one.
   */
  private async ensureDraft(session: IAssistantSession): Promise<void> {
    if (this.draftStore.has(session.draftId)) return;
    const draft = await this.draftStore.open(session.workflowId);
    session.draftId = draft.id;
    session.messages.push({
      role: 'assistant',
      content:
        "Note: the server restarted since this conversation began, so the in-progress draft was lost. I've started a fresh one from the currently saved workflow — anything not yet applied needs to be redone.",
    });
    await this.sessions.save(session);
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
    await this.ensureDraft(session);
    const modelProvider = await createModelProviderForSession(this.credentials, this.encryptionKey);
    const deps: IRunTurnDeps = {
      modelProvider,
      tools: createToolRegistry(),
      toolContext: {
        draftId: session.draftId,
        nodeTypes: this.nodeTypes,
        draftStore: this.draftStore,
        credentials: new CredentialRepositoryAdapter(this.credentials, this.encryptionKey, this.credentialTypes),
        executor: new ExecutionAdapter(
          this.draftStore,
          session.draftId,
          this.nodeTypes,
          this.credentialTypes,
          this.credentials,
          this.encryptionKey,
        ),
      },
    };

    startSseResponse(res);
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    try {
      const finished = await run(deps, { signal: controller.signal, onEvent: (event) => writeSseEvent(res, event) });
      await this.sessions.save(finished);
      this.captureInBackground(finished);
    } catch (err) {
      this.logger.error({ err, sessionId: session.id }, 'Assistant turn failed');
      writeSseEvent(res, { type: 'error', message: err instanceof Error ? err.message : String(err) });
      await this.sessions.save(session);
    } finally {
      res.end();
    }
  }

  /**
   * Recall for a new turn only: resumeApproval/resumeAskUser continue a turn whose system prompt
   * is already fixed, and re-recalling there would change it underneath the model mid-turn.
   *
   * Shadow mode: the result is logged and discarded. Injecting it into the prompt is milestone R5,
   * after the recalled results have been read on real transcripts. A failure never affects the turn.
   */
  private async recallInShadow(session: IAssistantSession, message: string): Promise<void> {
    const { config, port } = this.memory;
    if (!config.capture && !config.recall) return;

    const started = performance.now();
    try {
      const recalled = await port.recall(message, session.actor, config.tokenBudget);
      this.logger.info(
        {
          event: 'memory.recall.shadow',
          sessionId: session.id,
          workflowId: session.workflowId,
          query: redactText(message),
          injected: false,
          memoryCount: recalled.memories.length,
          // Not "tokensUsed": the logger redacts any key containing "token".
          budgetUsed: recalled.tokensUsed,
          memories: recalled.memories,
          trace: recalled.trace,
          durationMs: Math.round(performance.now() - started),
        },
        'Assistant memory recall (shadow mode, not injected)',
      );
    } catch (err) {
      this.logger.warn({ event: 'memory.recall.failed', sessionId: session.id, err }, 'Assistant memory recall failed; continuing without memory');
    }
  }

  /** Fire and forget: the user already has their answer, and extraction means model calls. Neither a rejection nor a synchronous throw escapes. */
  private captureInBackground(session: IAssistantSession): void {
    if (!this.memory.config.capture) return;
    void Promise.resolve()
      .then(() => this.memory.port.capture(session))
      .catch((err: unknown) => {
        this.logger.warn({ event: 'memory.capture.failed', sessionId: session.id, err }, 'Assistant memory capture failed');
      });
  }
}
