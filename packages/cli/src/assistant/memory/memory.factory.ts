import { NullMemoryAdapter } from './null-memory.adapter.js';
import { resolveOpenAiConfig } from '../model-provider.factory.js';
import { postgresConfigFromEnv } from '../../db/data-source.js';
import type { CompletionProvider, EmbeddingProvider, JobQueue, MemoryStore } from '@memnest/core';
import type { IAssistantMemoryPort } from '@runnel/assistant';
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
  /** Tests only: the Postgres to use instead of the DB_POSTGRES_* settings. */
  postgresUrl?: string;
  /** Tests only: a deterministic embedder instead of OpenAI's. */
  embedder?: EmbeddingProvider;
}

export const DISABLED_MEMORY_CONFIG: IMemoryConfig = { capture: false, recall: false, tokenBudget: 400, minScore: 1 };

/** Semantic recall on Postgres uses this model, resolved with the same key as the assistant. */
export const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;

export function disabledAssistantMemory(config: IMemoryConfig = DISABLED_MEMORY_CONFIG): IAssistantMemory {
  return { port: new NullMemoryAdapter(), config, close: async () => {} };
}

/**
 * Picks the memory adapter from config. Both flags off (the default) → NullMemoryAdapter, and
 * Memnest is never even imported, so a developer who never enables memory never gets its tables.
 *
 * The store follows Runnel's own database: SQLite gets keyword recall only; Postgres gets hybrid
 * keyword + semantic recall, which needs the pgvector extension and an embedding model.
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

  try {
    const resolveOpenAi = options.resolveOpenAi ?? (() => resolveOpenAiConfig(options.credentials, options.encryptionKey));
    const opened = db.type === 'sqlite' ? await openSqlite(db.database) : await openPostgres(options, resolveOpenAi, logger);
    if (!opened) return disabledAssistantMemory(memory);

    const [{ createMemnest }, { MemnestMemoryAdapter }] = await Promise.all([import('@memnest/core'), import('./memnest-memory.adapter.js')]);
    const memnest = createMemnest({
      store: opened.store,
      queue: opened.queue,
      completion: await lazyOpenAiCompletion(resolveOpenAi),
      ...(opened.embedder ? { embedder: opened.embedder } : {}),
    });
    memnest.startWorker();

    logger.info(
      {
        event: 'memory.enabled',
        store: db.type,
        capabilities: opened.store.capabilities(),
        semantic: Boolean(opened.embedder),
        capture: memory.capture,
        recall: memory.recall,
        minScore: memory.minScore,
      },
      `Assistant memory enabled (Memnest, ${opened.description}); ` +
        (memory.recall ? 'recalled memories WILL be sent to the model' : 'shadow mode, nothing is sent to the model'),
    );
    return { port: new MemnestMemoryAdapter(memnest), config: memory, close: () => memnest.close() };
  } catch (err) {
    logger.error({ err }, 'Assistant memory failed to start — memory stays disabled.');
    return disabledAssistantMemory(memory);
  }
}

interface IOpenedStore {
  store: MemoryStore;
  queue: JobQueue;
  embedder?: EmbeddingProvider;
  description: string;
}

/**
 * Memnest owns its schema — prefixed memnest_* tables here, a `memnest` schema on Postgres — and
 * migrates it itself. That is deliberately not part of the TypeORM migration arrays, so it only
 * ever runs when a memory flag is on.
 */
async function openSqlite(filename: string): Promise<IOpenedStore> {
  const { createSqliteStore } = await import('@memnest/store-sqlite');
  const store = createSqliteStore({ filename, autoMigrate: true });
  return { store, queue: store.jobQueue(), description: 'SQLite store — keyword recall only' };
}

/**
 * Postgres gets semantic recall, which needs pgvector. Memnest's migration creates the extension
 * and fails outright when the server doesn't have it — so it's checked up front, and a server
 * without it gets a warning that names the missing piece instead of a migration stack trace.
 */
async function openPostgres(
  options: ICreateAssistantMemoryOptions,
  resolveOpenAi: () => Promise<IOpenAiConfig>,
  logger: Logger,
): Promise<IOpenedStore | undefined> {
  const connectionString = options.postgresUrl ?? postgresUrlFromEnv();

  const { default: pg } = await import('pg');
  const probe = new pg.Pool({ connectionString, max: 1 });
  try {
    const { rowCount } = await probe.query("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'");
    if (!rowCount) {
      logger.warn(
        'Assistant memory on Postgres needs the pgvector extension, which this Postgres server does not have — memory stays disabled. ' +
          'Use an image that ships it (e.g. pgvector/pgvector:pg16) or install pgvector.',
      );
      return undefined;
    }
  } finally {
    await probe.end();
  }

  const { createPostgresStore } = await import('@memnest/store-postgres');
  const store = await createPostgresStore({ connectionString, autoMigrate: true });
  const embedder = options.embedder ?? (await lazyOpenAiEmbeddings(resolveOpenAi));
  return { store, queue: store.jobQueue(), embedder, description: 'Postgres store — keyword + semantic recall' };
}

function postgresUrlFromEnv(): string {
  const config = postgresConfigFromEnv();
  if (config.type !== 'postgres') throw new Error('postgresConfigFromEnv returned a non-Postgres config');
  const auth = `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}`;
  return `postgres://${auth}@${config.host}:${config.port}/${encodeURIComponent(config.database)}`;
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
    id: `openai:${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`,
    async complete(request) {
      const config = await resolve();
      return openAICompatibleCompletion({ apiKey: config.apiKey, baseURL: config.baseUrl, model: config.model }).complete(request);
    },
  };
}

/**
 * Same per-call resolution for embeddings. `id` and `dimensions` must be known up front: Memnest
 * locks each container to the provider that wrote its first vectors, so they can't depend on
 * which key happens to be configured. If an embedding call fails at recall time, Memnest falls
 * back to keyword recall for that query rather than failing it.
 */
async function lazyOpenAiEmbeddings(resolve: () => Promise<IOpenAiConfig>): Promise<EmbeddingProvider> {
  const { openAICompatibleEmbeddings } = await import('@memnest/providers');
  return {
    id: `openai:${EMBEDDING_MODEL}`,
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts) {
      const config = await resolve();
      return openAICompatibleEmbeddings({ apiKey: config.apiKey, baseURL: config.baseUrl, model: EMBEDDING_MODEL }).embed(texts);
    },
  };
}
