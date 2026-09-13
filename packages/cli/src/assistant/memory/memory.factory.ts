import { NullMemoryAdapter } from './null-memory.adapter.js';
import { resolveOpenAiConfig } from '../model-provider.factory.js';
import type { CompletionProvider } from '@memnest/core';
import type { IAssistantMemoryPort } from '@n8n-clone/assistant';
import type { Logger } from 'pino';
import type { Repository } from 'typeorm';
import type { IAppConfig, IMemoryConfig } from '../../config.js';
import type { CredentialEntity } from '../../db/entities/Credential.entity.js';
import type { IOpenAiConfig } from '../model-provider.factory.js';

export interface IAssistantMemory {
  port: IAssistantMemoryPort;
  config: IMemoryConfig;
  /** Stops the engine's worker and closes its store. A no-op when memory is disabled. */
  close(): Promise<void>;
}

export interface ICreateAssistantMemoryOptions {
  memory: IMemoryConfig;
  db: IAppConfig['db'];
  logger: Logger;
  credentials: Repository<CredentialEntity>;
  encryptionKey: string;
  /** Tests only: resolves the extraction model's credentials instead of the env var / stored openAiApi credential. */
  resolveOpenAi?: () => Promise<IOpenAiConfig>;
}

export const DISABLED_MEMORY_CONFIG: IMemoryConfig = { capture: false, recall: false, tokenBudget: 400 };

export function disabledAssistantMemory(config: IMemoryConfig = DISABLED_MEMORY_CONFIG): IAssistantMemory {
  return { port: new NullMemoryAdapter(), config, close: async () => {} };
}

/**
 * Picks the memory adapter from config. Both flags off (the default) → NullMemoryAdapter, and
 * Memnest is never even imported, so a developer who never enables memory never gets its tables.
 *
 * Memory is never allowed to stop the server: anything that goes wrong while starting it is
 * logged and falls back to the disabled adapter.
 */
export async function createAssistantMemory(options: ICreateAssistantMemoryOptions): Promise<IAssistantMemory> {
  const { memory, db, logger } = options;
  if (!memory.capture && !memory.recall) return disabledAssistantMemory(memory);

  if (memory.recall && !memory.capture) {
    logger.warn('RUNNEL_MEMORY_RECALL is on but RUNNEL_MEMORY_CAPTURE is off — recall will only ever find memories captured earlier.');
  }
  if (memory.recall) {
    logger.warn(
      'RUNNEL_MEMORY_RECALL is set, but injecting recalled memories into the prompt is not built yet (milestone R5, after the R4 shadow period) — recall is logged, never sent to the model.',
    );
  }

  if (db.type !== 'sqlite') {
    logger.warn('Assistant memory on Postgres is not supported yet (milestone R6) — memory stays disabled.');
    return disabledAssistantMemory(memory);
  }

  try {
    const [{ createMemnest }, { createSqliteStore }, { MemnestMemoryAdapter }] = await Promise.all([
      import('@memnest/core'),
      import('@memnest/store-sqlite'),
      import('./memnest-memory.adapter.js'),
    ]);

    // Memnest owns its schema (prefixed memnest_* tables) and migrates it itself — deliberately
    // not part of the TypeORM migration arrays, so it only ever runs when a memory flag is on.
    const store = createSqliteStore({ filename: db.database, autoMigrate: true });
    const resolveOpenAi = options.resolveOpenAi ?? (() => resolveOpenAiConfig(options.credentials, options.encryptionKey));
    const memnest = createMemnest({ store, queue: store.jobQueue(), completion: await lazyOpenAiCompletion(resolveOpenAi) });
    memnest.startWorker();

    logger.info(
      { event: 'memory.enabled', store: 'sqlite', capabilities: store.capabilities(), capture: memory.capture, recall: memory.recall },
      'Assistant memory enabled (Memnest, SQLite store — lexical recall only)',
    );
    return { port: new MemnestMemoryAdapter(memnest), config: memory, close: () => memnest.close() };
  } catch (err) {
    logger.error({ err }, 'Assistant memory failed to start — memory stays disabled.');
    return disabledAssistantMemory(memory);
  }
}

/**
 * Extraction's model, resolved per call the same way the assistant resolves its own (env var,
 * then the first stored openAiApi credential) — so a credential added through the editor after
 * boot is picked up without a restart. With neither, the extraction job fails and Memnest
 * retries it with backoff; the captured transcript itself is already stored.
 */
async function lazyOpenAiCompletion(resolve: () => Promise<IOpenAiConfig>): Promise<CompletionProvider> {
  const { openAICompatibleCompletion } = await import('@memnest/providers');
  return {
    id: `openai:${process.env.OPENAI_MODEL ?? 'gpt-4o-mini'}`,
    async complete(request) {
      const config = await resolve();
      return openAICompatibleCompletion({ apiKey: config.apiKey, baseURL: config.baseUrl, model: config.model }).complete(request);
    },
  };
}
