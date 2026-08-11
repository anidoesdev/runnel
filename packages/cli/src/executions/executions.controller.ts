import { Get, RestController } from '../http/decorators.js';
import { NotFoundError } from '../http/http-errors.js';
import type { Repository } from 'typeorm';
import type { Request } from 'express';
import type { ExecutionEntity } from '../db/entities/Execution.entity.js';

@RestController('/rest/executions')
export class ExecutionsController {
  constructor(private readonly executions: Repository<ExecutionEntity>) {}

  @Get('/')
  async list(req: Request) {
    const workflowId = req.query.workflowId ? String(req.query.workflowId) : undefined;
    return this.executions.find({
      where: workflowId ? { workflowId } : {},
      order: { startedAt: 'DESC' },
    });
  }

  @Get('/:id')
  async getOne(req: Request) {
    const entity = await this.executions.findOneBy({ id: String(req.params.id) });
    if (!entity) throw new NotFoundError(`Execution "${req.params.id}" not found`);
    return entity;
  }
}
