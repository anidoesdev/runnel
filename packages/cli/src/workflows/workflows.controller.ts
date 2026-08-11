import { Delete, Get, Patch, Post, RestController } from '../http/decorators.js';
import { createWorkflowSchema, executeWorkflowSchema, updateWorkflowSchema } from './workflow.dto.js';
import { generateId } from '../db/id.js';
import { BadRequestError, NotFoundError } from '../http/http-errors.js';
import { runWorkflow } from '../execution/run-workflow.js';
import type { ICredentialTypes, INodeTypes } from '@n8n-clone/core';
import type { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import type { ExecutionEntity } from '../db/entities/Execution.entity.js';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { ActiveWorkflowManager } from '../active-workflows/active-workflow-manager.js';

@RestController('/rest/workflows')
export class WorkflowsController {
  constructor(
    private readonly workflows: Repository<WorkflowEntity>,
    private readonly executions: Repository<ExecutionEntity>,
    private readonly credentials: Repository<CredentialEntity>,
    private readonly nodeTypes: INodeTypes,
    private readonly credentialTypes: ICredentialTypes,
    private readonly encryptionKey: string,
    private readonly activeWorkflowManager: ActiveWorkflowManager,
  ) {}

  @Post('/')
  async create(req: Request) {
    const parsed = createWorkflowSchema.parse(req.body);
    const entity = this.workflows.create({
      id: generateId(),
      name: parsed.name,
      active: false,
      nodes: parsed.nodes,
      connections: parsed.connections,
      settings: parsed.settings ?? null,
      staticData: null,
      pinData: null,
    });
    await this.setActive(entity, parsed.active);
    return entity;
  }

  @Get('/')
  async list() {
    return this.workflows.find();
  }

  @Get('/:id')
  async getOne(req: Request) {
    return this.findOrThrow(String(req.params.id));
  }

  @Patch('/:id')
  async update(req: Request) {
    const entity = await this.findOrThrow(String(req.params.id));
    const parsed = updateWorkflowSchema.parse(req.body);

    if (parsed.name !== undefined) entity.name = parsed.name;
    if (parsed.nodes !== undefined) entity.nodes = parsed.nodes;
    if (parsed.connections !== undefined) entity.connections = parsed.connections;
    if (parsed.settings !== undefined) entity.settings = parsed.settings;

    // Re-running setActive(true) even when `active` didn't change re-activates the workflow,
    // which is exactly what's needed when nodes/connections/settings changed underneath it —
    // otherwise a webhook path or poll interval edited while active would never take effect.
    await this.setActive(entity, parsed.active ?? entity.active);
    return entity;
  }

  @Delete('/:id')
  async remove(req: Request, res: Response) {
    const entity = await this.findOrThrow(String(req.params.id));
    await this.activeWorkflowManager.deactivate(entity.id);
    await this.workflows.remove(entity);
    res.status(204).end();
  }

  @Post('/:id/execute')
  async execute(req: Request) {
    const entity = await this.findOrThrow(String(req.params.id));
    const parsed = executeWorkflowSchema.parse(req.body ?? {});

    let run;
    try {
      run = await runWorkflow(
        entity,
        {
          nodeTypes: this.nodeTypes,
          credentialTypes: this.credentialTypes,
          credentials: this.credentials,
          encryptionKey: this.encryptionKey,
        },
        {
          mode: 'manual',
          startNodeName: parsed.startNodeName,
          startData: parsed.data?.map((json) => ({ json })),
        },
      );
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : String(err));
    }

    const status = run.result.resultData.error ? 'error' : 'success';
    const executionEntity = this.executions.create({
      id: generateId(),
      workflowId: entity.id,
      mode: 'manual',
      status,
      stoppedAt: new Date().toISOString(),
      data: run.result,
    });
    await this.executions.save(executionEntity);

    return { executionId: executionEntity.id, status, data: run.result };
  }

  /** Starts/stops the workflow's triggers, polls, and webhooks to match `active`, then persists the flag — a failed activation (e.g. a webhook path collision) leaves the workflow inactive rather than silently saving a flag the runtime doesn't actually reflect. */
  private async setActive(entity: WorkflowEntity, active: boolean): Promise<void> {
    if (active) {
      try {
        await this.activeWorkflowManager.activate(entity);
      } catch (err) {
        throw new BadRequestError(err instanceof Error ? err.message : String(err));
      }
    } else {
      await this.activeWorkflowManager.deactivate(entity.id);
    }
    entity.active = active;
    await this.workflows.save(entity);
  }

  private async findOrThrow(id: string): Promise<WorkflowEntity> {
    const entity = await this.workflows.findOneBy({ id });
    if (!entity) throw new NotFoundError(`Workflow "${id}" not found`);
    return entity;
  }
}
