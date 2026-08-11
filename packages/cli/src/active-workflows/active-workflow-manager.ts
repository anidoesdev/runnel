import {
  WorkflowExecute,
  buildPollFunctions,
  buildTriggerFunctions,
  buildWebhookFunctions,
  decryptCredentialData,
} from '@n8n-clone/core';
import { generateId } from '../db/id.js';
import { toWorkflowBase } from '../execution/run-workflow.js';
import type { ICredentialTypes, INodeTypes } from '@n8n-clone/core';
import type { IDataObject, INode, INodeType, IRunExecutionData, IWorkflowBase, NodeOutput, WorkflowExecuteMode } from '@n8n-clone/workflow';
import type { Repository } from 'typeorm';
import type { Logger } from 'pino';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import type { ExecutionEntity } from '../db/entities/Execution.entity.js';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

export interface IWebhookRequest {
  method: string;
  headers: IDataObject;
  body: unknown;
  query: IDataObject;
}

export interface IWebhookResponse {
  status: number;
  body: unknown;
}

interface IActiveTrigger {
  nodeName: string;
  close: () => Promise<void>;
}

interface IActivePoll {
  nodeName: string;
  timer: ReturnType<typeof setInterval>;
}

interface IWebhookRegistryEntry {
  workflowId: string;
  nodeName: string;
}

function normalizeWebhookPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

function webhookKey(method: string, path: string): string {
  return `${method.toUpperCase()}:${normalizeWebhookPath(path)}`;
}

/**
 * Owns everything an "active" workflow needs while the server keeps running: starting each
 * trigger/poll node's real lifecycle (trigger()'s returned closeFunction, poll()'s interval
 * timer) and registering webhook nodes so incoming HTTP requests can be routed to them.
 * `activate`/`deactivate` are idempotent and safe to call again on every workflow
 * create/update/delete — WorkflowsController does exactly that, so the running state here
 * never drifts from the `active` column in the database for longer than one request.
 */
export class ActiveWorkflowManager {
  private readonly activeTriggers = new Map<string, IActiveTrigger[]>();
  private readonly activePolls = new Map<string, IActivePoll[]>();
  private readonly webhookRegistry = new Map<string, IWebhookRegistryEntry>();

  constructor(
    private readonly nodeTypes: INodeTypes,
    private readonly credentialTypes: ICredentialTypes,
    private readonly workflows: Repository<WorkflowEntity>,
    private readonly executions: Repository<ExecutionEntity>,
    private readonly credentials: Repository<CredentialEntity>,
    private readonly encryptionKey: string,
    private readonly logger: Logger,
  ) {}

  /** Loads and activates every workflow already marked active — called once at server startup. */
  async init(): Promise<void> {
    const activeWorkflows = await this.workflows.find({ where: { active: true } });
    for (const workflow of activeWorkflows) {
      try {
        await this.activate(workflow);
      } catch (err) {
        this.logger.error({ err, workflowId: workflow.id }, 'Failed to activate workflow on startup');
      }
    }
  }

  isActive(workflowId: string): boolean {
    return (
      this.activeTriggers.has(workflowId) ||
      this.activePolls.has(workflowId) ||
      Array.from(this.webhookRegistry.values()).some((entry) => entry.workflowId === workflowId)
    );
  }

  /**
   * Starts every trigger/poll/webhook node in `workflow`. Re-activating an already-active
   * workflow (e.g. after an edit) deactivates the previous registration first, so stale
   * timers/webhooks from the old node parameters never linger. On failure, everything this
   * call itself started is torn back down before the error is rethrown — a partially-started
   * activation is worse than no activation at all.
   */
  async activate(workflow: WorkflowEntity): Promise<void> {
    if (this.isActive(workflow.id)) {
      await this.deactivate(workflow.id);
    }

    const workflowDef = toWorkflowBase(workflow);
    const triggers: IActiveTrigger[] = [];
    const polls: IActivePoll[] = [];
    const webhookKeys: string[] = [];

    const rollback = async (): Promise<void> => {
      for (const trigger of triggers) await trigger.close();
      for (const poll of polls) clearInterval(poll.timer);
      for (const key of webhookKeys) this.webhookRegistry.delete(key);
    };

    try {
      for (const node of workflow.nodes) {
        if (node.disabled) continue;
        const nodeType = this.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);

        if (nodeType.webhook) {
          const key = this.registerWebhook(workflow.id, node);
          webhookKeys.push(key);
        }

        if (nodeType.trigger) {
          triggers.push(await this.startTrigger(workflow, workflowDef, node));
        }

        if (nodeType.poll) {
          polls.push(this.startPoll(workflow, workflowDef, node, nodeType));
        }
      }
    } catch (err) {
      await rollback();
      throw err;
    }

    if (triggers.length) this.activeTriggers.set(workflow.id, triggers);
    if (polls.length) this.activePolls.set(workflow.id, polls);
  }

  async deactivate(workflowId: string): Promise<void> {
    const triggers = this.activeTriggers.get(workflowId);
    if (triggers) {
      for (const trigger of triggers) await trigger.close();
      this.activeTriggers.delete(workflowId);
    }

    const polls = this.activePolls.get(workflowId);
    if (polls) {
      for (const poll of polls) clearInterval(poll.timer);
      this.activePolls.delete(workflowId);
    }

    for (const [key, entry] of this.webhookRegistry) {
      if (entry.workflowId === workflowId) this.webhookRegistry.delete(key);
    }
  }

  async deactivateAll(): Promise<void> {
    const workflowIds = new Set([...this.activeTriggers.keys(), ...this.activePolls.keys()]);
    for (const entry of this.webhookRegistry.values()) workflowIds.add(entry.workflowId);
    for (const workflowId of workflowIds) await this.deactivate(workflowId);
  }

  /**
   * Dispatches an incoming HTTP request to the registered webhook node, runs the rest of the
   * workflow, and returns the HTTP response to send back. Returns `null` when no webhook is
   * registered for this method+path, so the caller (the Express webhook router) can answer 404.
   */
  async handleWebhookRequest(method: string, path: string, request: Omit<IWebhookRequest, 'method'>): Promise<IWebhookResponse | null> {
    const entry = this.webhookRegistry.get(webhookKey(method, path));
    if (!entry) return null;

    const workflow = await this.workflows.findOneBy({ id: entry.workflowId });
    if (!workflow) return null;
    const node = workflow.nodes.find((candidate) => candidate.name === entry.nodeName);
    if (!node) return null;

    const workflowDef = toWorkflowBase(workflow);
    const nodeType = this.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);

    let responseStatus = (node.parameters.responseCode as number | undefined) ?? 200;
    const response = { status: (code: number) => (responseStatus = code), send: () => undefined };

    const context = buildWebhookFunctions({
      node,
      workflow: workflowDef,
      mode: 'webhook',
      credentialsResolver: this.buildCredentialsResolver(),
      credentialTypes: this.credentialTypes,
      request: { method: method.toUpperCase(), headers: request.headers, body: request.body, query: request.query },
      response,
    });

    const webhookResult = await nodeType.webhook!.call(context);
    await this.persistStaticData(workflow, workflowDef);

    if (webhookResult.noWebhookResponse) {
      return { status: responseStatus, body: undefined };
    }

    const responseMode = (node.parameters.responseMode as string | undefined) ?? 'onReceived';

    if (responseMode !== 'lastNode' || !webhookResult.workflowData) {
      if (webhookResult.workflowData) {
        void this.runAndPersist(workflow, workflowDef, node.name, webhookResult.workflowData, 'webhook').catch((err: unknown) => {
          this.logger.error({ err, workflowId: workflow.id, node: node.name }, 'Webhook-triggered run failed');
        });
      }
      return { status: responseStatus, body: webhookResult.webhookResponse ?? { message: 'Workflow was started' } };
    }

    const result = await this.runAndPersist(workflow, workflowDef, node.name, webhookResult.workflowData, 'webhook');
    const lastNode = result.resultData.lastNodeExecuted;
    const lastNodeOutput = lastNode ? result.resultData.runData[lastNode]?.at(-1)?.data?.main?.[0] : undefined;
    return { status: responseStatus, body: webhookResult.webhookResponse ?? lastNodeOutput ?? [] };
  }

  private registerWebhook(workflowId: string, node: INode): string {
    const method = String(node.parameters.httpMethod ?? 'GET');
    const path = String(node.parameters.path ?? '');
    const key = webhookKey(method, path);

    const existing = this.webhookRegistry.get(key);
    if (existing && existing.workflowId !== workflowId) {
      throw new Error(
        `Webhook "${method.toUpperCase()} /webhook/${normalizeWebhookPath(path)}" is already registered by another active workflow`,
      );
    }

    this.webhookRegistry.set(key, { workflowId, nodeName: node.name });
    return key;
  }

  private async startTrigger(workflow: WorkflowEntity, workflowDef: IWorkflowBase, node: INode): Promise<IActiveTrigger> {
    const nodeType = this.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
    const context = buildTriggerFunctions({
      node,
      workflow: workflowDef,
      mode: 'trigger',
      credentialsResolver: this.buildCredentialsResolver(),
      credentialTypes: this.credentialTypes,
      emit: (data: NodeOutput) => {
        void this.runAndPersist(workflow, workflowDef, node.name, data, 'trigger').catch((err: unknown) => {
          this.logger.error({ err, workflowId: workflow.id, node: node.name }, 'Trigger-emitted run failed');
        });
      },
    });

    const response = await nodeType.trigger!.call(context);
    return { nodeName: node.name, close: response.closeFunction ?? (async () => undefined) };
  }

  private startPoll(workflow: WorkflowEntity, workflowDef: IWorkflowBase, node: INode, nodeType: INodeType): IActivePoll {
    const intervalMs = this.resolvePollIntervalMs(node);

    const tick = (): void => {
      void this.runPoll(workflow, workflowDef, node, nodeType).catch((err: unknown) => {
        this.logger.error({ err, workflowId: workflow.id, node: node.name }, 'Poll trigger failed');
      });
    };

    const timer = setInterval(tick, intervalMs);
    return { nodeName: node.name, timer };
  }

  private async runPoll(workflow: WorkflowEntity, workflowDef: IWorkflowBase, node: INode, nodeType: INodeType): Promise<void> {
    const context = buildPollFunctions({
      node,
      workflow: workflowDef,
      mode: 'trigger',
      credentialsResolver: this.buildCredentialsResolver(),
      credentialTypes: this.credentialTypes,
    });

    const output = await nodeType.poll!.call(context);
    await this.persistStaticData(workflow, workflowDef);
    if (output === null) return;

    await this.runAndPersist(workflow, workflowDef, node.name, output, 'trigger');
  }

  private resolvePollIntervalMs(node: INode): number {
    const raw = node.parameters.pollIntervalSeconds;
    const seconds = typeof raw === 'number' ? raw : Number(raw ?? 60);
    return Math.max(1, Number.isFinite(seconds) ? seconds : 60) * 1000;
  }

  private async runAndPersist(
    workflow: WorkflowEntity,
    workflowDef: IWorkflowBase,
    startNodeName: string,
    startData: NodeOutput,
    mode: WorkflowExecuteMode,
  ): Promise<IRunExecutionData> {
    const engine = new WorkflowExecute(this.nodeTypes, {
      mode,
      credentialTypes: this.credentialTypes,
      credentialsResolver: this.buildCredentialsResolver(),
    });

    const result = await engine.run(workflowDef, startNodeName, startData);
    await this.persistStaticData(workflow, workflowDef);

    const executionEntity = this.executions.create({
      id: generateId(),
      workflowId: workflow.id,
      mode,
      status: result.resultData.error ? 'error' : 'success',
      stoppedAt: new Date().toISOString(),
      data: result,
    });
    await this.executions.save(executionEntity);

    return result;
  }

  /**
   * getWorkflowStaticData mutates `workflowDef.staticData` in place — save it back so a poll
   * cursor or trigger-set value survives a server restart. Uses `.save()` with the full
   * entity rather than `.update()` with a partial: a `QueryDeepPartialEntity<WorkflowEntity>`
   * recursing into `staticData`'s already-recursive `IDataObject` type is exactly the
   * "excessively deep" TS2589 the migration tests hit with WorkflowEntity's nested types
   * (see migrations.sqlite.test.ts) — `.save()` on the concrete entity type sidesteps it.
   */
  private async persistStaticData(workflow: WorkflowEntity, workflowDef: IWorkflowBase): Promise<void> {
    workflow.staticData = workflowDef.staticData ?? null;
    await this.workflows.save(workflow);
  }

  private buildCredentialsResolver(): (credentialTypeName: string) => Promise<IDataObject> {
    return async (credentialTypeName: string) => {
      const credential = await this.credentials.findOneBy({ type: credentialTypeName });
      if (!credential) throw new Error(`No stored credential of type "${credentialTypeName}"`);
      return decryptCredentialData(
        JSON.parse(credential.data) as Parameters<typeof decryptCredentialData>[0],
        this.encryptionKey,
      );
    };
  }
}
