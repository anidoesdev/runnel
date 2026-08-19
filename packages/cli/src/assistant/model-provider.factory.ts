import { decryptCredentialData } from '@n8n-clone/core';
import { OpenAiModelProvider } from '@n8n-clone/assistant';
import type { IModelProvider } from '@n8n-clone/assistant';
import type { Repository } from 'typeorm';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

/**
 * Resolves the model provider the same way run-workflow.ts resolves any other credential:
 * the first stored credential of the requested type. Real per-request model *selection* (a
 * user picking a specific credential when several openAiApi credentials exist) is an editor
 * concern for a later pass, same simplification already accepted for node execution.
 */
export async function createModelProviderForSession(
  credentials: Repository<CredentialEntity>,
  encryptionKey: string,
  model = 'gpt-4o-mini',
): Promise<IModelProvider> {
  const credential = await credentials.findOneBy({ type: 'openAiApi' });
  if (!credential) {
    throw new Error('No stored credential of type "openAiApi" — add one before starting an assistant session.');
  }
  const { apiKey, baseUrl } = decryptCredentialData(
    JSON.parse(credential.data) as Parameters<typeof decryptCredentialData>[0],
    encryptionKey,
  ) as { apiKey: string; baseUrl?: string };

  return new OpenAiModelProvider({ apiKey, baseUrl, model });
}
