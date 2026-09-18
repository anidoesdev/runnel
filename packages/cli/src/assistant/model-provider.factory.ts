import { decryptCredentialData } from '@runnel/core';
import { OpenAiModelProvider } from '@runnel/assistant';
import type { IModelProvider } from '@runnel/assistant';
import type { Repository } from 'typeorm';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

export interface IOpenAiConfig {
  apiKey: string;
  baseUrl?: string;
  model: string;
}

/**
 * Resolves the model provider two ways, env var first:
 *
 * 1. `OPENAI_API_KEY` in the server's own environment — for local dev and self-hosting, so
 *    running the assistant doesn't require going through the credential UI/DB at all. This is
 *    the same env var the eval harness (packages/assistant/src/evals/run-evals.ts) already reads,
 *    kept consistent rather than inventing a second name for the same key. `OPENAI_BASE_URL`/
 *    `OPENAI_MODEL` are read alongside it if set.
 * 2. Otherwise, the first stored `openAiApi` credential — the same way run-workflow.ts resolves
 *    any other credential. Real per-request model *selection* (a user picking a specific
 *    credential when several openAiApi credentials exist) is an editor concern for a later pass,
 *    same simplification already accepted for node execution.
 *
 * Shared by the assistant's model provider and assistant memory's extraction calls.
 */
export async function resolveOpenAiConfig(
  credentials: Repository<CredentialEntity>,
  encryptionKey: string,
  model = 'gpt-4o-mini',
): Promise<IOpenAiConfig> {
  const envApiKey = process.env.OPENAI_API_KEY;
  if (envApiKey) {
    return { apiKey: envApiKey, baseUrl: process.env.OPENAI_BASE_URL, model: process.env.OPENAI_MODEL ?? model };
  }

  const credential = await credentials.findOneBy({ type: 'openAiApi' });
  if (!credential) {
    throw new Error(
      'No stored credential of type "openAiApi" — add one before starting an assistant session, or set OPENAI_API_KEY in the environment.',
    );
  }
  const { apiKey, baseUrl } = decryptCredentialData(
    JSON.parse(credential.data) as Parameters<typeof decryptCredentialData>[0],
    encryptionKey,
  ) as { apiKey: string; baseUrl?: string };

  return { apiKey, baseUrl, model };
}

/** The model provider for one assistant turn, resolved as described on resolveOpenAiConfig. */
export async function createModelProviderForSession(
  credentials: Repository<CredentialEntity>,
  encryptionKey: string,
  model = 'gpt-4o-mini',
): Promise<IModelProvider> {
  return new OpenAiModelProvider(await resolveOpenAiConfig(credentials, encryptionKey, model));
}
