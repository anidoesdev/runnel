import { encryptCredentialData } from '@runnel/core';
import { generateId } from '../db/id.js';
import type { ICredentialTypes } from '@runnel/core';
import type { ICredentialRepositoryPort, ICredentialSummary } from '@runnel/workflow-tools';
import type { IDataObject } from '@runnel/workflow';
import type { Repository } from 'typeorm';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

function toSummary(entity: CredentialEntity): ICredentialSummary {
  return { id: entity.id, name: entity.name, type: entity.type };
}

/** Every field's declared default (e.g. openAiApi's `baseUrl` defaulting to the real API host) — the same values CredentialModal.vue pre-fills a brand-new credential form with. An unregistered type falls back to `{}` rather than throwing; the placeholder still gets created, just without seeded defaults. */
function defaultDataFor(type: string, credentialTypes: ICredentialTypes): IDataObject {
  try {
    const properties = credentialTypes.getByName(type).properties;
    return Object.fromEntries(properties.map((property) => [property.name, property.default])) as IDataObject;
  } catch {
    return {};
  }
}

/**
 * TypeORM-backed ICredentialRepositoryPort. `list` never selects/returns `data` (the encrypted
 * blob) — same "credential values never leave the server" contract CredentialsController
 * already enforces for the REST API. `createPlaceholder` seeds the encrypted row with the
 * credential type's own field defaults rather than a bare `{}` — a field like openAiApi's
 * `baseUrl` has a working default that a still-unconfigured node shouldn't have to do without
 * (see the "undefined/chat/completions" failure this was fixed alongside); secret fields with
 * no default (`apiKey`) stay empty until the user finishes setup at the returned setup URL.
 */
export class CredentialRepositoryAdapter implements ICredentialRepositoryPort {
  constructor(
    private readonly credentials: Repository<CredentialEntity>,
    private readonly encryptionKey: string,
    private readonly credentialTypes: ICredentialTypes,
  ) {}

  async list(type?: string): Promise<ICredentialSummary[]> {
    const all = await this.credentials.find(type ? { where: { type } } : {});
    return all.map(toSummary);
  }

  async createPlaceholder(type: string, name: string): Promise<ICredentialSummary> {
    const encrypted = encryptCredentialData(defaultDataFor(type, this.credentialTypes), this.encryptionKey);
    const entity = this.credentials.create({ id: generateId(), name, type, data: JSON.stringify(encrypted) });
    const saved = await this.credentials.save(entity);
    return toSummary(saved);
  }
}
