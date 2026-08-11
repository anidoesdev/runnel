import { encryptCredentialData } from '@n8n-clone/core';
import { Delete, Get, Patch, Post, RestController } from '../http/decorators.js';
import { createCredentialSchema, updateCredentialSchema } from './credential.dto.js';
import { generateId } from '../db/id.js';
import { NotFoundError } from '../http/http-errors.js';
import type { IDataObject } from '@n8n-clone/workflow';
import type { Repository } from 'typeorm';
import type { Request, Response } from 'express';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

/** Never includes `data` (the encrypted blob) — plaintext or ciphertext, credential values never leave the server via the API. */
function toSafeCredential(entity: CredentialEntity) {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

@RestController('/rest/credentials')
export class CredentialsController {
  constructor(
    private readonly credentials: Repository<CredentialEntity>,
    private readonly encryptionKey: string,
  ) {}

  @Post('/')
  async create(req: Request) {
    const parsed = createCredentialSchema.parse(req.body);
    const encrypted = encryptCredentialData(parsed.data as IDataObject, this.encryptionKey);
    const entity = this.credentials.create({
      id: generateId(),
      name: parsed.name,
      type: parsed.type,
      data: JSON.stringify(encrypted),
    });
    await this.credentials.save(entity);
    return toSafeCredential(entity);
  }

  @Get('/')
  async list() {
    const all = await this.credentials.find();
    return all.map(toSafeCredential);
  }

  @Get('/:id')
  async getOne(req: Request) {
    return toSafeCredential(await this.findOrThrow(String(req.params.id)));
  }

  @Patch('/:id')
  async update(req: Request) {
    const entity = await this.findOrThrow(String(req.params.id));
    const parsed = updateCredentialSchema.parse(req.body);

    if (parsed.name !== undefined) entity.name = parsed.name;
    if (parsed.type !== undefined) entity.type = parsed.type;
    if (parsed.data !== undefined) {
      entity.data = JSON.stringify(encryptCredentialData(parsed.data as IDataObject, this.encryptionKey));
    }

    await this.credentials.save(entity);
    return toSafeCredential(entity);
  }

  @Delete('/:id')
  async remove(req: Request, res: Response) {
    const entity = await this.findOrThrow(String(req.params.id));
    await this.credentials.remove(entity);
    res.status(204).end();
  }

  private async findOrThrow(id: string): Promise<CredentialEntity> {
    const entity = await this.credentials.findOneBy({ id });
    if (!entity) throw new NotFoundError(`Credential "${id}" not found`);
    return entity;
  }
}
