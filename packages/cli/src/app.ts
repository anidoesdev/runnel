import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { MapCredentialTypes, MapNodeTypes } from '@n8n-clone/core';
import { allCredentialTypes, allNodeTypes, registerAllCredentialTypes, registerAllNodeTypes } from '@n8n-clone/nodes-base';
import { WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import { requireAuth } from './auth/auth.middleware.js';
import { AuthController } from './auth/auth.controller.js';
import { HealthController } from './health/health.controller.js';
import { WorkflowsController } from './workflows/workflows.controller.js';
import { CredentialsController } from './credentials/credentials.controller.js';
import { ExecutionsController } from './executions/executions.controller.js';
import { NodeTypesController } from './node-types/node-types.controller.js';
import { CredentialTypesController } from './credential-types/credential-types.controller.js';
import { AssistantController } from './assistant/assistant.controller.js';
import { WorkflowRepositoryAdapter } from './assistant/workflow-repository.adapter.js';
import { AssistantSessionRepositoryAdapter } from './assistant/assistant-session.repository.js';
import { buildRouterForController } from './http/router-builder.js';
import { buildErrorMiddleware } from './http/error-middleware.js';
import { buildAccessLogMiddleware } from './http/access-log.js';
import { buildAuthRateLimiter } from './http/rate-limit.js';
import { buildWebhookRouter } from './webhooks/webhook-router.js';
import { ActiveWorkflowManager } from './active-workflows/active-workflow-manager.js';
import { registerCustomNodeTypes } from './custom-nodes/load-custom-nodes.js';
import { UserEntity } from './db/entities/User.entity.js';
import { WorkflowEntity } from './db/entities/Workflow.entity.js';
import { CredentialEntity } from './db/entities/Credential.entity.js';
import { ExecutionEntity } from './db/entities/Execution.entity.js';
import { AssistantSessionEntity } from './db/entities/AssistantSession.entity.js';
import type { Express } from 'express';
import type { DataSource } from 'typeorm';
import type { Logger } from 'pino';
import type { INodeType } from '@n8n-clone/workflow';

export interface ICreateAppOptions {
  dataSource: DataSource;
  encryptionKey: string;
  jwtSecret: Uint8Array;
  logger: Logger;
  /** Already-loaded third-party node types (see custom-nodes/load-custom-nodes.ts) to register alongside the built-in ones — loading is async I/O, so it happens before createApp (which stays synchronous) is called. */
  customNodeTypes?: INodeType[];
}

export interface ICreatedApp {
  app: Express;
  activeWorkflowManager: ActiveWorkflowManager;
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

// Webhook paths are registered at runtime by active workflows, so they can't live in a fixed
// Set — every request under /webhook/ is public by design (see auth.middleware.ts).
const PUBLIC_PATH_PREFIXES = ['/webhook/'];

export function createApp(options: ICreateAppOptions): ICreatedApp {
  const { dataSource, encryptionKey, jwtSecret, logger } = options;

  const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
  const credentialTypes = registerAllCredentialTypes(new MapCredentialTypes());

  const builtInNodeNames = new Set(allNodeTypes.map((nodeType) => nodeType.description.name));
  const registeredCustomNodeTypes = registerCustomNodeTypes(
    options.customNodeTypes ?? [],
    nodeTypes,
    builtInNodeNames,
    logger,
  );

  const userRepo = dataSource.getRepository(UserEntity);
  const workflowRepo = dataSource.getRepository(WorkflowEntity);
  const credentialRepo = dataSource.getRepository(CredentialEntity);
  const executionRepo = dataSource.getRepository(ExecutionEntity);
  const assistantSessionRepo = dataSource.getRepository(AssistantSessionEntity);

  // One instance for the app's lifetime — a draft is an in-memory copy-on-write overlay (see
  // WorkflowDraftStore's own doc comment on why), so every request that touches the assistant
  // must share the same store rather than each getting its own empty one.
  const workflowDraftStore = new WorkflowDraftStore(new WorkflowRepositoryAdapter(workflowRepo));

  const activeWorkflowManager = new ActiveWorkflowManager(
    nodeTypes,
    credentialTypes,
    workflowRepo,
    executionRepo,
    credentialRepo,
    encryptionKey,
    logger,
  );

  const app = express();
  app.use(helmet());
  app.use(buildAccessLogMiddleware(logger));
  app.use(express.json());
  app.use(cookieParser());
  app.use(['/rest/auth/login', '/rest/auth/setup'], buildAuthRateLimiter());
  app.use('/webhook', buildWebhookRouter(activeWorkflowManager));
  app.use(requireAuth(jwtSecret, PUBLIC_PATHS, PUBLIC_PATH_PREFIXES));

  const controllers = [
    new HealthController(dataSource),
    new AuthController(userRepo, jwtSecret),
    new WorkflowsController(
      workflowRepo,
      executionRepo,
      credentialRepo,
      nodeTypes,
      credentialTypes,
      encryptionKey,
      activeWorkflowManager,
    ),
    new CredentialsController(credentialRepo, encryptionKey),
    new ExecutionsController(executionRepo),
    new NodeTypesController([...allNodeTypes, ...registeredCustomNodeTypes].map((nodeType) => nodeType.description)),
    new CredentialTypesController(allCredentialTypes),
    new AssistantController(
      new AssistantSessionRepositoryAdapter(assistantSessionRepo),
      workflowDraftStore,
      credentialRepo,
      nodeTypes,
      credentialTypes,
      encryptionKey,
      logger,
    ),
  ];

  for (const controller of controllers) {
    const { basePath, router } = buildRouterForController(controller);
    app.use(basePath, router);
  }

  app.use(buildErrorMiddleware(logger));

  return { app, activeWorkflowManager };
}
