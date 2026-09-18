import { createDataSource, postgresConfigFromEnv, sqliteConfig } from './db/data-source.js';
import { createApp } from './app.js';
import { createLogger } from './logging/logger.js';
import { loadConfig } from './config.js';
import { loadCustomNodeTypes } from './custom-nodes/load-custom-nodes.js';
import { createAssistantMemory } from './assistant/memory/memory.factory.js';
import { CredentialEntity } from './db/entities/Credential.entity.js';
import { WorkflowEntity } from './db/entities/Workflow.entity.js';
import { purgeExpiredTrash, TRASH_RETENTION_DAYS } from './workflows/trash.js';
import type { Server } from 'node:http';
import type { DataSource } from 'typeorm';
import type { Logger } from 'pino';

export interface IRunningServer {
  server: Server;
  dataSource: DataSource;
  logger: Logger;
  port: number;
  close: () => Promise<void>;
}

export async function startServer(): Promise<IRunningServer> {
  const config = loadConfig();
  const logger = createLogger();

  if (config.usingDevDefaults.encryptionKey) {
    logger.warn('RUNNEL_ENCRYPTION_KEY is not set — using an insecure development default. Do not use this in production.');
  }
  if (config.usingDevDefaults.jwtSecret) {
    logger.warn('RUNNEL_JWT_SECRET is not set — using an insecure development default. Do not use this in production.');
  }

  const dataSource = createDataSource(
    config.db.type === 'sqlite' ? sqliteConfig(config.db.database) : postgresConfigFromEnv(),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const customNodeTypes = config.customNodesDir ? await loadCustomNodeTypes(config.customNodesDir, logger) : [];

  // After the DataSource is up and migrated: Memnest owns its own schema and only creates it when a memory flag is on.
  const memory = await createAssistantMemory({
    memory: config.memory,
    db: config.db,
    logger,
    credentials: dataSource.getRepository(CredentialEntity),
    encryptionKey: config.encryptionKey,
  });

  // Trash also purges when it is listed; doing it at boot means a server that runs daily
  // cleans up even if nobody ever opens the trash view.
  const purged = await purgeExpiredTrash(dataSource.getRepository(WorkflowEntity));
  if (purged > 0) logger.info(`Purged ${purged} workflow(s) deleted more than ${TRASH_RETENTION_DAYS} days ago`);

  const { app, activeWorkflowManager } = createApp({
    dataSource,
    encryptionKey: config.encryptionKey,
    jwtSecret: config.jwtSecret,
    logger,
    customNodeTypes,
    memory,
    systemInfo: { database: config.db.type, customNodesDir: config.customNodesDir ?? null },
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(config.port, () => resolve(s));
  });
  logger.info(`runnel server listening on port ${config.port}`);

  await activeWorkflowManager.init();

  const close = async (): Promise<void> => {
    await activeWorkflowManager.deactivateAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await memory.close();
    await dataSource.destroy();
  };

  process.once('SIGTERM', () => void close().then(() => process.exit(0)));
  process.once('SIGINT', () => void close().then(() => process.exit(0)));

  return { server, dataSource, logger, port: config.port, close };
}
