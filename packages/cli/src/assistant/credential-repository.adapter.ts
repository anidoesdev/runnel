import { encryptCredentialData } from '@n8n-clone/core';
import { generateId } from '../db/id.js';
import type { ICredentialRepositoryPort, ICredentialSummary } from '@n8n-clone/workflow-tools';
import type { Repository } from 'typeorm';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

function toSummary(entity: CredentialEntity): ICredentialSummary {
  return { id: entity.id, name: entity.name, type: entity.type };
}

/**
 * TypeORM-backed ICredentialRepositoryPort. `list` never selects/returns `data` (the encrypted
 * blob) — same "credential values never leave the server" contract CredentialsController
 * already enforces for the REST API. `createPlaceholder` stores an encrypted empty object
 * rather than plaintext `{}`: the row shape is identical to a real credential's, so nothing
 * downstream (a future decrypt call, once the user finishes setup) needs a special case for
 * "this one was never encrypted".
 */
export class CredentialRepositoryAdapter implements ICredentialRepositoryPort {
  constructor(
    private readonly credentials: Repository<CredentialEntity>,
    private readonly encryptionKey: string,
  ) {}

  async list(type?: string): Promise<ICredentialSummary[]> {
    const all = await this.credentials.find(type ? { where: { type } } : {});
    return all.map(toSummary);
  }

  async createPlaceholder(type: string, name: string): Promise<ICredentialSummary> {
    const encrypted = encryptCredentialData({}, this.encryptionKey);
    const entity = this.credentials.create({ id: generateId(), name, type, data: JSON.stringify(encrypted) });
    const saved = await this.credentials.save(entity);
    return toSummary(saved);
  }
}
