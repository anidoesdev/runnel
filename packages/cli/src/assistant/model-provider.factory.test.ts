import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptCredentialData } from '@n8n-clone/core';
import { OpenAiModelProvider } from '@n8n-clone/assistant';
import { createModelProviderForSession } from './model-provider.factory.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { DataSource, Repository } from 'typeorm';

const ENCRYPTION_KEY = 'test-encryption-key';

describe('createModelProviderForSession', () => {
  let dataSource: DataSource;
  let credentials: Repository<CredentialEntity>;

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    credentials = dataSource.getRepository(CredentialEntity);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('resolves the stored openAiApi credential into a real OpenAiModelProvider', async () => {
    const encrypted = encryptCredentialData({ apiKey: 'sk-test', baseUrl: 'https://api.openai.test/v1' }, ENCRYPTION_KEY);
    await credentials.insert({ id: 'c1', name: 'My OpenAI', type: 'openAiApi', data: JSON.stringify(encrypted) });

    const provider = await createModelProviderForSession(credentials, ENCRYPTION_KEY);

    expect(provider).toBeInstanceOf(OpenAiModelProvider);
  });

  it('throws a clear error when no openAiApi credential is stored', async () => {
    await expect(createModelProviderForSession(credentials, ENCRYPTION_KEY)).rejects.toThrow(/No stored credential of type "openAiApi"/);
  });
});
