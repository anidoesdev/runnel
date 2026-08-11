import cookieParser from 'cookie-parser';
import express from 'express';
import { MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { registerAllCredentialTypes, registerAllNodeTypes } from '@n8n-clone/nodes-base';
import { requireAuth } from './auth/auth.middleware.js';
import { AuthController } from './auth/auth.controller.js';
import { HealthController } from './health/health.controller.js';
import { WorkflowsController } from './workflows/workflows.controller.js';
import { CredentialsController } from './credentials/credentials.controller.js';
import { ExecutionsController } from './executions/executions.controller.js';
import { buildRouterForController } from './http/router-builder.js';
import { buildErrorMiddleware } from './http/error-middleware.js';
import { UserEntity } from './db/entities/User.entity.js';
import { WorkflowEntity } from './db/entities/Workflow.entity.js';
import { CredentialEntity } from './db/entities/Credential.entity.js';
import { ExecutionEntity } from './db/entities/Execution.entity.js';
import type { Express } from 'express';
import type { DataSource } from 'typeorm';
import type { Logger } from 'pino';

export interface ICreateAppOptions {
  dataSource: DataSource;
  encryptionKey: string;
  jwtSecret: Uint8Array;
  logger: Logger;
}

// Both with and without the trailing slash: a @RestController('/healthz') + @Get('/') route
// resolves to the full path "/healthz/", but callers reasonably also try "/healthz".
const PUBLIC_PATHS = new Set([
  '/healthz',
  '/healthz/',
  '/healthz/readiness',
  '/rest/auth/setup',
  '/rest/auth/login',
]);

export function createApp(options: ICreateAppOptions): Express {
  const { dataSource, encryptionKey, jwtSecret, logger } = options;

  const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
  const credentialTypes = registerAllCredentialTypes(new MapCredentialTypes());

  const userRepo = dataSource.getRepository(UserEntity);
  const workflowRepo = dataSource.getRepository(WorkflowEntity);
  const credentialRepo = dataSource.getRepository(CredentialEntity);
  const executionRepo = dataSource.getRepository(ExecutionEntity);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(requireAuth(jwtSecret, PUBLIC_PATHS));

  const controllers = [
    new HealthController(dataSource),
    new AuthController(userRepo, jwtSecret),
    new WorkflowsController(workflowRepo, executionRepo, credentialRepo, nodeTypes, credentialTypes, encryptionKey),
    new CredentialsController(credentialRepo, encryptionKey),
    new ExecutionsController(executionRepo),
  ];

  for (const controller of controllers) {
    const { basePath, router } = buildRouterForController(controller);
    app.use(basePath, router);
  }

  app.use(buildErrorMiddleware(logger));

  return app;
}
