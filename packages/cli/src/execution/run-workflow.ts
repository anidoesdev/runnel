import { decryptCredentialData, WorkflowExecute } from '@n8n-clone/core';
import { Workflow } from '@n8n-clone/workflow';
import type { ICredentialTypes, INodeTypes } from '@n8n-clone/core';
import type { INodeExecutionData, IRunExecutionData, IWorkflowBase, WorkflowExecuteMode } from '@n8n-clone/workflow';
import type { Repository } from 'typeorm';
import type { WorkflowEntity } from '../db/entities/Workflow.entity.js';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

export function toWorkflowBase(entity: WorkflowEntity): IWorkflowBase {
  return {
    id: entity.id,
    name: entity.name,
    active: entity.active,
    nodes: entity.nodes,
    connections: entity.connections,
    settings: entity.settings ?? undefined,
    staticData: entity.staticData ?? undefined,
    pinData: entity.pinData ?? undefined,
  };
}

/**
 * A node with no incoming `main` connection is a plausible start node (a trigger). Falls back
 * to the first node when every node has a parent (e.g. a pure sub-workflow).
 *
 * A node that only ever *supplies* an `ai_languageModel`/`ai_tool` connection (a chat model, a
 * tool) also has no incoming `main` connection, but it's not a trigger either — it's a
 * sub-node, never meant to run on its own. Anything that's the source of a non-`main`
 * connection is excluded from candidacy for exactly that reason.
 */
export function findStartNodeName(workflow: IWorkflowBase): string | undefined {
  const targets = new Set<string>();
  const subNodeSources = new Set<string>();

  for (const [source, entry] of Object.entries(workflow.connections)) {
    for (const [type, branches] of Object.entries(entry)) {
      for (const branch of branches ?? []) {
        for (const connection of branch) {
          if (type === 'main') targets.add(connection.node);
          else subNodeSources.add(source);
        }
      }
    }
  }

  return (
    workflow.nodes.find((node) => !targets.has(node.name) && !subNodeSources.has(node.name))?.name ??
    workflow.nodes[0]?.name
  );
}

export interface IRunWorkflowDeps {
  nodeTypes: INodeTypes;
  credentialTypes: ICredentialTypes;
  credentials: Repository<CredentialEntity>;
  encryptionKey: string;
}

export interface IRunWorkflowOptions {
  mode: WorkflowExecuteMode;
  startNodeName?: string;
  startData?: INodeExecutionData[];
  /** Runs only the minimal subgraph needed to reach this node (it + its ancestors) and stops there — see Workflow.pruneToDestination. Powers the editor's per-node "run to here" button. */
  destinationNode?: string;
  /** See WorkflowExecute's own dryRun option — nodes not classified dryRunSafety => 'safe' are mocked rather than actually run. Used by the assistant's grounding tools (execute_dry_run), never by a user-facing "Execute Workflow"/"Run to Here" click. */
  dryRun?: boolean;
}

export interface IRunWorkflowResult {
  workflowDef: IWorkflowBase;
  startNodeName: string;
  result: IRunExecutionData;
}

/** The "resolve start node, build a credentials-aware engine, run it" logic shared by runWorkflow (a persisted WorkflowEntity) and the assistant's grounding executor (an in-memory draft, never persisted). */
export async function runWorkflowDefinition(
  workflowBase: IWorkflowBase,
  deps: IRunWorkflowDeps,
  options: IRunWorkflowOptions,
): Promise<IRunWorkflowResult> {
  const workflowDef = options.destinationNode
    ? new Workflow(workflowBase).pruneToDestination(options.destinationNode)
    : workflowBase;
  const startNodeName = options.startNodeName ?? findStartNodeName(workflowDef);
  if (!startNodeName) {
    throw new Error(`Workflow "${workflowBase.id}" has no nodes to start from`);
  }

  const engine = new WorkflowExecute(deps.nodeTypes, {
    mode: options.mode,
    dryRun: options.dryRun,
    credentialTypes: deps.credentialTypes,
    credentialsResolver: async (credentialTypeName: string) => {
      const credential = await deps.credentials.findOneBy({ type: credentialTypeName });
      if (!credential) throw new Error(`No stored credential of type "${credentialTypeName}"`);
      return decryptCredentialData(
        JSON.parse(credential.data) as Parameters<typeof decryptCredentialData>[0],
        deps.encryptionKey,
      );
    },
  });

  const result = options.startData
    ? await engine.run(workflowDef, startNodeName, [options.startData])
    : await engine.run(workflowDef, startNodeName);

  return { workflowDef, startNodeName, result };
}

/**
 * Shared by the REST "execute workflow" endpoint and the `n8n-clone execute` CLI command —
 * both need the same "resolve start node, build a credentials-aware engine, run it" logic.
 *
 * Credential resolution is deliberately simple: "the first stored credential of the
 * requested type". Proper per-node credential *assignment* (a node picking a specific
 * credential id out of several of the same type, via `node.credentials[type].id`) is an
 * editor concern — M8 is what actually lets a user make that choice.
 */
export async function runWorkflow(
  workflowEntity: WorkflowEntity,
  deps: IRunWorkflowDeps,
  options: IRunWorkflowOptions,
): Promise<IRunWorkflowResult> {
  return runWorkflowDefinition(toWorkflowBase(workflowEntity), deps, options);
}
