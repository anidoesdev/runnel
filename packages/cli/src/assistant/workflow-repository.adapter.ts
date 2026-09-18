import { toWorkflowBase } from '../execution/run-workflow.js';
import { NotFoundError } from '../http/http-errors.js';
import type { IWorkflowBase } from '@runnel/workflow';
import type { IWorkflowRepositoryPort } from '@runnel/workflow-tools';
import type { Repository } from 'typeorm';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';

/**
 * TypeORM-backed IWorkflowRepositoryPort — the seam WorkflowDraftStore uses to load and, on
 * apply(), persist the real workflow. `save` only ever writes the fields a draft can actually
 * change (nodes, connections, settings, staticData, pinData) — the workflow's own name/active
 * flag are a separate concern the assistant doesn't touch.
 */
export class WorkflowRepositoryAdapter implements IWorkflowRepositoryPort {
  constructor(private readonly workflows: Repository<WorkflowEntity>) {}

  async get(workflowId: string): Promise<IWorkflowBase> {
    const entity = await this.workflows.findOneBy({ id: workflowId });
    if (!entity) throw new NotFoundError(`Workflow "${workflowId}" not found`);
    return toWorkflowBase(entity);
  }

  async save(workflowId: string, workflow: IWorkflowBase): Promise<IWorkflowBase> {
    const entity = await this.workflows.findOneBy({ id: workflowId });
    if (!entity) throw new NotFoundError(`Workflow "${workflowId}" not found`);

    entity.nodes = workflow.nodes;
    entity.connections = workflow.connections;
    entity.settings = workflow.settings ?? null;
    entity.staticData = workflow.staticData ?? null;
    entity.pinData = workflow.pinData ?? null;

    const saved = await this.workflows.save(entity);
    return toWorkflowBase(saved);
  }
}
