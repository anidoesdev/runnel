import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptCredentialData } from '@n8n-clone/core';
import { CredentialRepositoryAdapter } from './credential-repository.adapter.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { DataSource, Repository } from 'typeorm';
import type { IEncryptedCredentialData } from '@n8n-clone/core';

const ENCRYPTION_KEY = 'test-encryption-key';

describe('CredentialRepositoryAdapter', () => {
  let dataSource: DataSource;
  let credentials: Repository<CredentialEntity>;
  let adapter: CredentialRepositoryAdapter;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    credentials = dataSource.getRepository(CredentialEntity);
    adapter = new CredentialRepositoryAdapter(credentials, ENCRYPTION_KEY);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('list() returns id/name/type only — never the encrypted data field', async () => {
    await credentials.insert({ id: 'c1', name: 'My OpenAI', type: 'openAiApi', data: '{"iv":"x"}' });

    const result = await adapter.list();

    expect(result).toEqual([{ id: 'c1', name: 'My OpenAI', type: 'openAiApi' }]);
  });

  it('list(type) filters by credential type', async () => {
    await credentials.insert([
      { id: 'c1', name: 'My OpenAI', type: 'openAiApi', data: '{}' },
      { id: 'c2', name: 'My Postgres', type: 'postgresApi', data: '{}' },
    ]);

    const result = await adapter.list('postgresApi');

    expect(result).toEqual([{ id: 'c2', name: 'My Postgres', type: 'postgresApi' }]);
  });

  it('createPlaceholder() stores real encrypted data (not plaintext) that decrypts back to an empty object', async () => {
    const summary = await adapter.createPlaceholder('slackApi', 'New Slack (needs setup)');

    expect(summary).toMatchObject({ name: 'New Slack (needs setup)', type: 'slackApi' });
    const row = await credentials.findOneByOrFail({ id: summary.id });
    expect(row.data).not.toContain('{}'); // not stored as plaintext JSON
    const decrypted = decryptCredentialData(JSON.parse(row.data) as IEncryptedCredentialData, ENCRYPTION_KEY);
    expect(decrypted).toEqual({});
  });
});
