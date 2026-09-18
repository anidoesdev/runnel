import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encryptCredentialData } from '@runnel/core';
import { OpenAiModelProvider } from '@runnel/assistant';
import { createModelProviderForSession } from './model-provider.factory.js';
import { createDataSource, sqliteConfig } from '../db/data-source.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';
import type { DataSource, Repository } from 'typeorm';

const ENCRYPTION_KEY = 'test-encryption-key';

describe('createModelProviderForSession', () => {
  let dataSource: DataSource;
  let credentials: Repository<CredentialEntity>;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    dataSource = createDataSource(sqliteConfig(':memory:'));
    await dataSource.initialize();
    await dataSource.runMigrations();
    credentials = dataSource.getRepository(CredentialEntity);
  });

  afterEach(async () => {
    await dataSource.destroy();
    process.env = { ...originalEnv };
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

  it('prefers OPENAI_API_KEY from the environment over a stored credential', async () => {
    const encrypted = encryptCredentialData({ apiKey: 'sk-from-db' }, ENCRYPTION_KEY);
    await credentials.insert({ id: 'c1', name: 'My OpenAI', type: 'openAiApi', data: JSON.stringify(encrypted) });
    process.env.OPENAI_API_KEY = 'sk-from-env';

    const provider = await createModelProviderForSession(credentials, ENCRYPTION_KEY);

    expect(provider).toBeInstanceOf(OpenAiModelProvider);
  });

  it('resolves from OPENAI_API_KEY alone, with no credential row and without touching the DB', async () => {
    process.env.OPENAI_API_KEY = 'sk-from-env';
    const findSpy = vi.spyOn(credentials, 'findOneBy');

    const provider = await createModelProviderForSession(credentials, ENCRYPTION_KEY);

    expect(provider).toBeInstanceOf(OpenAiModelProvider);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('falls back to the stored credential when OPENAI_API_KEY is unset', async () => {
    delete process.env.OPENAI_API_KEY;
    const encrypted = encryptCredentialData({ apiKey: 'sk-from-db' }, ENCRYPTION_KEY);
    await credentials.insert({ id: 'c1', name: 'My OpenAI', type: 'openAiApi', data: JSON.stringify(encrypted) });

    const provider = await createModelProviderForSession(credentials, ENCRYPTION_KEY);

    expect(provider).toBeInstanceOf(OpenAiModelProvider);
  });
});
