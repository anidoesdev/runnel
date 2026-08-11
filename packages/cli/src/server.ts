import { createDataSource, postgresConfigFromEnv, sqliteConfig } from './db/data-source.js';
import { createApp } from './app.js';
import { createLogger } from './logging/logger.js';
import { loadConfig } from './config.js';
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
    logger.warn('N8N_ENCRYPTION_KEY is not set — using an insecure development default. Do not use this in production.');
  }
  if (config.usingDevDefaults.jwtSecret) {
    logger.warn('N8N_JWT_SECRET is not set — using an insecure development default. Do not use this in production.');
  }

  const dataSource = createDataSource(
    config.db.type === 'sqlite' ? sqliteConfig(config.db.database) : postgresConfigFromEnv(),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  const { app, activeWorkflowManager } = createApp({
    dataSource,
    encryptionKey: config.encryptionKey,
    jwtSecret: config.jwtSecret,
    logger,
  });

  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(config.port, () => resolve(s));
  });
  logger.info(`n8n-clone server listening on port ${config.port}`);

  await activeWorkflowManager.init();

  const close = async (): Promise<void> => {
    await activeWorkflowManager.deactivateAll();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await dataSource.destroy();
  };

  process.once('SIGTERM', () => void close().then(() => process.exit(0)));
  process.once('SIGINT', () => void close().then(() => process.exit(0)));

  return { server, dataSource, logger, port: config.port, close };
}
