import { MapCredentialTypes, MapNodeTypes } from '@runnel/core';
import { allNodeTypes, registerAllCredentialTypes, registerAllNodeTypes } from '@runnel/nodes-base';
import { createDataSource, postgresConfigFromEnv, sqliteConfig } from '../db/data-source.js';
import { loadConfig } from '../config.js';
import { runWorkflow } from '../execution/run-workflow.js';
import { loadCustomNodeTypes, registerCustomNodeTypes } from '../custom-nodes/load-custom-nodes.js';
import { createLogger } from '../logging/logger.js';
import { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import { CredentialEntity } from '../db/entities/Credential.entity.js';

/** `runnel execute --id=<workflowId>`: runs a stored workflow directly, prints the resulting IRunExecutionData as JSON, and returns a process exit code. */
export async function executeCommand(workflowId: string): Promise<number> {
  const config = loadConfig();
  const dataSource = createDataSource(
    config.db.type === 'sqlite' ? sqliteConfig(config.db.database) : postgresConfigFromEnv(),
  );
  await dataSource.initialize();
  await dataSource.runMigrations();

  try {
    const workflowRepo = dataSource.getRepository(WorkflowEntity);
    const credentialRepo = dataSource.getRepository(CredentialEntity);
    const workflow = await workflowRepo.findOneBy({ id: workflowId });
    if (!workflow) {
      console.error(`Workflow "${workflowId}" not found`);
      return 1;
    }

    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const credentialTypes = registerAllCredentialTypes(new MapCredentialTypes());

    if (config.customNodesDir) {
      const logger = createLogger();
      const customNodeTypes = await loadCustomNodeTypes(config.customNodesDir, logger);
      const builtInNodeNames = new Set(allNodeTypes.map((nodeType) => nodeType.description.name));
      registerCustomNodeTypes(customNodeTypes, nodeTypes, builtInNodeNames, logger);
    }

    const { result } = await runWorkflow(
      workflow,
      { nodeTypes, credentialTypes, credentials: credentialRepo, encryptionKey: config.encryptionKey },
      { mode: 'cli' },
    );

    console.log(JSON.stringify(result, null, 2));
    return result.resultData.error ? 1 : 0;
  } finally {
    await dataSource.destroy();
  }
}
