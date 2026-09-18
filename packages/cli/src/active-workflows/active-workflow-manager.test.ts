import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapCredentialTypes, MapNodeTypes } from '@runnel/core';
import { registerAllCredentialTypes, registerAllNodeTypes } from '@runnel/nodes-base';
import { ActiveWorkflowManager } from './active-workflow-manager.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { createLogger } from '../logging/logger.js';
import { generateId } from '../db/id.js';
import { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import { ExecutionEntity } from '../db/entities/Execution.entity.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import { NotificationEntity } from '../db/entities/Notification.entity.js';
import { NotificationService } from '../notifications/notification.service.js';
import type { DataSource, Repository } from 'typeorm';
import type { INode } from '@runnel/workflow';

describe('ActiveWorkflowManager', () => {
  let dataSource: DataSource;
  let manager: ActiveWorkflowManager;
  let workflows: Repository<WorkflowEntity>;
  let executions: Repository<ExecutionEntity>;
  let notifications: Repository<NotificationEntity>;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();

    workflows = dataSource.getRepository(WorkflowEntity);
    executions = dataSource.getRepository(ExecutionEntity);
    notifications = dataSource.getRepository(NotificationEntity);
    const credentials = dataSource.getRepository(CredentialEntity);

    manager = new ActiveWorkflowManager(
      registerAllNodeTypes(new MapNodeTypes()),
      registerAllCredentialTypes(new MapCredentialTypes()),
      workflows,
      executions,
      credentials,
      'test-encryption-key',
      createLogger({ level: 'silent' }),
      new NotificationService(notifications),
    );
  });

  afterEach(async () => {
    await manager.deactivateAll();
    await dataSource.destroy();
  });

  async function saveWorkflow(nodes: INode[], connections: WorkflowEntity['connections']): Promise<WorkflowEntity> {
    const entity = workflows.create({
      id: generateId(),
      name: 'Test Workflow',
      active: false,
      nodes,
      connections,
      settings: null,
      staticData: null,
      pinData: null,
    });
    await workflows.save(entity);
    return entity;
  }

  function scheduleTriggerNode(overrides: Partial<INode['parameters']> = {}): INode {
    return {
      id: 'n1',
      name: 'Schedule',
      type: 'scheduleTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: { interval: 5, unit: 'seconds', ...overrides },
    };
  }

  function pollTriggerNode(items: string): INode {
    return {
      id: 'n1',
      name: 'Poll',
      type: 'pollTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: { pollIntervalSeconds: 5, items },
    };
  }

  function webhookNode(path: string, httpMethod = 'POST', responseMode = 'onReceived'): INode {
    return {
      id: 'n1',
      name: 'Webhook',
      type: 'webhook',
      typeVersion: 1,
      position: [0, 0],
      parameters: { httpMethod, path, responseMode },
    };
  }

  const doneNode: INode = { id: 'n2', name: 'Done', type: 'noOp', typeVersion: 1, position: [1, 0], parameters: {} };

  describe('Schedule Trigger — trigger() lifecycle', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('runs the workflow and records an execution on every tick', async () => {
      const entity = await saveWorkflow([scheduleTriggerNode(), doneNode], {
        Schedule: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      await vi.advanceTimersByTimeAsync(5000);
      expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(5000);
      const runs = await executions.find({ where: { workflowId: entity.id } });
      expect(runs).toHaveLength(2);
      expect(runs[0]!.mode).toBe('trigger');
      expect(runs[0]!.status).toBe('success');
      // A successful unattended run is not news: nothing reaches the bell.
      expect(await notifications.find()).toEqual([]);
    });

    it('notifies when an unattended run fails', async () => {
      const failing: INode = {
        id: 'n2',
        name: 'Boom',
        type: 'code',
        typeVersion: 1,
        position: [1, 0],
        parameters: { mode: 'runOnceForAllItems', jsCode: "throw new Error('boom');" },
      };
      const entity = await saveWorkflow([scheduleTriggerNode(), failing], {
        Schedule: { main: [[{ node: 'Boom', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      await vi.advanceTimersByTimeAsync(5000);

      const recorded = await notifications.find();
      expect(recorded).toHaveLength(1);
      expect(recorded[0]).toMatchObject({ type: 'execution_failed', workflowId: entity.id, workflowName: 'Test Workflow', readAt: null });
      expect(recorded[0]!.message).toContain('boom');
      expect(recorded[0]!.executionId).toBe((await executions.find())[0]!.id);
    });

    it('stops ticking once deactivated', async () => {
      const entity = await saveWorkflow([scheduleTriggerNode(), doneNode], {
        Schedule: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);
      await manager.deactivate(entity.id);

      await vi.advanceTimersByTimeAsync(20_000);
      expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(0);
    });

    it('re-activating (e.g. after an edit) does not double-fire the old timer', async () => {
      const entity = await saveWorkflow([scheduleTriggerNode(), doneNode], {
        Schedule: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);
      await manager.activate(entity);

      await vi.advanceTimersByTimeAsync(5000);
      expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(1);
    });
  });

  describe('Poll Trigger — poll() lifecycle', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('only runs the workflow when poll() returns new items, and persists the cursor', async () => {
      const entity = await saveWorkflow([pollTriggerNode(JSON.stringify([{ id: 1 }])), doneNode], {
        Poll: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      await vi.advanceTimersByTimeAsync(5000);
      expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(1);

      // Same items again on the next tick — poll() returns null, so no new execution.
      await vi.advanceTimersByTimeAsync(5000);
      expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(1);

      const stored = await workflows.findOneBy({ id: entity.id });
      expect(stored?.staticData).toEqual({ node: { Poll: { seenIds: [1] } } });
    });
  });

  describe('Webhook dispatch', () => {
    it('returns null for an unregistered method/path', async () => {
      const result = await manager.handleWebhookRequest('GET', '/nope', { headers: {}, body: {}, query: {} });
      expect(result).toBeNull();
    });

    it('onReceived: responds immediately and runs the rest of the workflow in the background', async () => {
      const entity = await saveWorkflow([webhookNode('hook-a', 'POST', 'onReceived'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      const result = await manager.handleWebhookRequest('POST', '/hook-a', { headers: {}, body: { name: 'Ada' }, query: {} });
      expect(result).toEqual({ status: 200, body: { message: 'Workflow was started' } });

      await vi.waitFor(async () => {
        expect(await executions.find({ where: { workflowId: entity.id } })).toHaveLength(1);
      });
      const [run] = await executions.find({ where: { workflowId: entity.id } });
      expect(run!.mode).toBe('webhook');
      expect(run!.status).toBe('success');
    });

    it('lastNode: waits for the run and responds with the last executed node\'s output', async () => {
      const entity = await saveWorkflow([webhookNode('hook-b', 'POST', 'lastNode'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      const result = await manager.handleWebhookRequest('POST', '/hook-b', { headers: {}, body: { name: 'Ada' }, query: {} });
      expect(result?.status).toBe(200);
      expect(result?.body).toEqual([
        { json: { headers: {}, params: {}, query: {}, body: { name: 'Ada' } } },
      ]);
    });

    it('matches method and path case-insensitively/without leading-slash sensitivity', async () => {
      const entity = await saveWorkflow([webhookNode('hook-c', 'GET'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(entity);

      const result = await manager.handleWebhookRequest('get', 'hook-c', { headers: {}, body: {}, query: {} });
      expect(result).not.toBeNull();
    });
  });

  describe('activation errors', () => {
    it('rejects activating a workflow whose webhook path collides with another active workflow', async () => {
      const first = await saveWorkflow([webhookNode('shared-path'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(first);

      const second = await saveWorkflow([webhookNode('shared-path'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await expect(manager.activate(second)).rejects.toThrow(/already registered/);
    });

    it('leaves the first workflow serving the webhook after the second activation is rejected', async () => {
      const first = await saveWorkflow([webhookNode('shared-path-2'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await manager.activate(first);

      const second = await saveWorkflow([webhookNode('shared-path-2'), doneNode], {
        Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
      });
      await expect(manager.activate(second)).rejects.toThrow();

      const result = await manager.handleWebhookRequest('POST', '/shared-path-2', { headers: {}, body: {}, query: {} });
      expect(result).not.toBeNull();
    });
  });
});
