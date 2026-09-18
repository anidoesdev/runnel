import { allNodeTypes } from '@runnel/nodes-base';

export function getLoadedNodeTypeNames(): string[] {
  return allNodeTypes.map((nodeType) => nodeType.description.name);
}

export { createApp } from './app.js';
export type { ICreateAppOptions, ICreatedApp } from './app.js';
export { ActiveWorkflowManager } from './active-workflows/active-workflow-manager.js';
export { startServer } from './server.js';
export type { IRunningServer } from './server.js';
export { loadConfig } from './config.js';
export type { IAppConfig } from './config.js';
export { createDataSource, sqliteConfig, postgresConfigFromEnv } from './db/data-source.js';
export type { IDatabaseConfig } from './db/data-source.js';
export { generateId } from './db/id.js';
export { createLogger } from './logging/logger.js';
export { redactSecrets } from './logging/redact.js';
