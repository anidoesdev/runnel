import { firstItem, inferItemSchema, redactSample } from '@n8n-clone/workflow-tools';
import { runWorkflowDefinition } from '../execution/run-workflow.js';
import type { INodeOutputSample, IWorkflowExecutionSummary, IWorkflowExecutorPort } from '@n8n-clone/workflow-tools';
import type { ICredentialTypes, INodeTypes } from '@n8n-clone/core';
import type { ITaskData } from '@n8n-clone/workflow';
import type { Repository } from 'typeorm';
import type { WorkflowDraftStore } from '@n8n-clone/workflow-tools';
import type { CredentialEntity } from '../db/entities/Credential.entity.js';

function toSample(task: ITaskData): INodeOutputSample {
  const item = firstItem(task.data?.main[0]);
  return {
    itemCount: task.data?.main.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0,
    mocked: task.mocked ?? false,
    schema: item ? inferItemSchema(item.json) : {},
    sample: item ? redactSample(item.json) : undefined,
  };
}

/**
 * TypeORM/engine-backed IWorkflowExecutorPort — the only implementation of grounding's
 * execution seam (see execution.port.ts in workflow-tools). Runs the DRAFT's *current* working
 * copy, re-read from the draft store on every `run()` call so a mutation earlier in the same
 * turn (add_node, set_node_parameters, ...) is reflected — never the last-saved/live workflow.
 *
 * `run()` caches every node's last recorded task for the lifetime of this instance so
 * `getNodeOutput` can read it back — one instance per agent turn (constructed fresh in
 * AssistantController.streamTurn, same as every other tool-context dependency), so the cache
 * never outlives the turn it was populated in.
 */
export class ExecutionAdapter implements IWorkflowExecutorPort {
  private lastRunData = new Map<string, ITaskData>();

  constructor(
    private readonly draftStore: WorkflowDraftStore,
    private readonly draftId: string,
    private readonly nodeTypes: INodeTypes,
    private readonly credentialTypes: ICredentialTypes,
    private readonly credentials: Repository<CredentialEntity>,
    private readonly encryptionKey: string,
  ) {}

  async run(destinationNode: string, dryRun: boolean): Promise<IWorkflowExecutionSummary> {
    const workflowBase = this.draftStore.get(this.draftId).current;
    const { result } = await runWorkflowDefinition(
      workflowBase,
      { nodeTypes: this.nodeTypes, credentialTypes: this.credentialTypes, credentials: this.credentials, encryptionKey: this.encryptionKey },
      { mode: 'manual', destinationNode, dryRun },
    );

    const perNode: IWorkflowExecutionSummary['perNode'] = {};
    for (const [nodeName, tasks] of Object.entries(result.resultData.runData)) {
      const task = tasks.at(-1);
      if (!task) continue;
      this.lastRunData.set(nodeName, task);
      perNode[nodeName] = {
        itemCount: task.data?.main.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0,
        error: task.error?.message,
        mocked: task.mocked,
      };
    }

    return { status: result.resultData.error ? 'error' : 'success', perNode };
  }

  getNodeOutput(nodeName: string): INodeOutputSample | undefined {
    const task = this.lastRunData.get(nodeName);
    return task ? toSample(task) : undefined;
  }
}
