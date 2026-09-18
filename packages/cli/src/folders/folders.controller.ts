import { z } from 'zod';
import { Delete, Get, Patch, Post, RestController } from '../http/decorators.js';
import { generateId } from '../db/id.js';
import { NotFoundError } from '../http/http-errors.js';
import type { Request, Response } from 'express';
import type { Repository } from 'typeorm';
import type { FolderEntity } from '../db/entities/Folder.entity.js';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';

const folderSchema = z.object({ name: z.string().min(1).max(100) });

@RestController('/rest/folders')
export class FoldersController {
  constructor(
    private readonly folders: Repository<FolderEntity>,
    private readonly workflows: Repository<WorkflowEntity>,
  ) {}

  @Get('/')
  async list() {
    return this.folders.find({ order: { name: 'ASC' } });
  }

  @Post('/')
  async create(req: Request) {
    const { name } = folderSchema.parse(req.body);
    return this.folders.save(this.folders.create({ id: generateId(), name }));
  }

  @Patch('/:id')
  async rename(req: Request) {
    const folder = await this.findOrThrow(String(req.params.id));
    folder.name = folderSchema.parse(req.body).name;
    return this.folders.save(folder);
  }

  /** Deletes the folder, not its workflows: every member is moved back to "no folder". */
  @Delete('/:id')
  async remove(req: Request, res: Response) {
    const folder = await this.findOrThrow(String(req.params.id));
    await this.workflows.update({ folderId: folder.id }, { folderId: null });
    await this.folders.remove(folder);
    res.status(204).end();
  }

  private async findOrThrow(id: string): Promise<FolderEntity> {
    const folder = await this.folders.findOneBy({ id });
    if (!folder) throw new NotFoundError(`Folder "${id}" not found`);
    return folder;
  }
}
