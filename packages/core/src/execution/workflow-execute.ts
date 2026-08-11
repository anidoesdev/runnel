import { NodeApiError, NodeOperationError } from '@n8n-clone/workflow';
import { buildExecuteFunctions } from './execute-context.js';
import type { ICredentialTypes } from '../credentials/credential-types.js';
import type {
  IDataObject,
  IExecuteData,
  IHttpRequestOptions,
  INode,
  INodeExecutionData,
  IRunExecutionData,
  ISourceData,
  ITaskData,
  ITaskDataError,
  IWorkflowBase,
  NodeOutput,
  WorkflowExecuteMode,
} from '@n8n-clone/workflow';
import type { INodeTypes } from './node-types.js';

export interface IWorkflowExecuteOptions {
  mode: WorkflowExecuteMode;
  /** Injectable delay for retryOnFail's waitBetweenTries — tests pass a no-op to stay fast. */
  sleep?: (ms: number) => Promise<void>;
  credentialsResolver?: (credentialTypeName: string) => Promise<IDataObject>;
  credentialTypes?: ICredentialTypes;
  httpClient?: (options: IHttpRequestOptions) => Promise<unknown>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function hasIncomingConnection(workflow: IWorkflowBase, nodeName: string): boolean {
  return Object.values(workflow.connections).some((connection) =>
    connection.main.some((branch) => branch.some((entry) => entry.node === nodeName)),
  );
}

function totalItemCount(data: NodeOutput): number {
  return data.reduce((sum, branch) => sum + (branch?.length ?? 0), 0);
}

function toTaskDataError(node: INode, err: unknown): ITaskDataError {
  const message = err instanceof Error ? err.message : String(err);
  const description = err instanceof NodeOperationError || err instanceof NodeApiError ? err.description : undefined;
  return { message, description, node: node.name, timestamp: Date.now() };
}

function tagItemsWithError(items: INodeExecutionData[], error: ITaskDataError): INodeExecutionData[] {
  return items.map((item) => ({ ...item, error: { name: 'NodeOperationError', ...error } }));
}

/**
 * Walks an IWorkflowBase, calling each reachable node's `execute()` and threading data
 * between them. `run` and `resume` are the same loop over the same IRunExecutionData —
 * that's what makes mid-execution serialization/resume possible: there is no separate
 * "live" state that `resume` would need to reconstruct.
 */
export class WorkflowExecute {
  constructor(
    private readonly nodeTypes: INodeTypes,
    private readonly options: IWorkflowExecuteOptions,
  ) {}

  async run(
    workflow: IWorkflowBase,
    startNodeName: string,
    startData: NodeOutput = [[{ json: {} }]],
  ): Promise<IRunExecutionData> {
    const startNode = workflow.nodes.find((node) => node.name === startNodeName);
    if (!startNode) {
      throw new Error(`Node "${startNodeName}" not found in workflow "${workflow.name}"`);
    }

    const runExecutionData: IRunExecutionData = {
      startData: { startNodes: [startNodeName] },
      resultData: { runData: {} },
      executionData: {
        contextData: {},
        nodeExecutionStack: [{ node: startNode, data: { main: startData }, source: null }],
        waitingExecution: {},
        waitingExecutionSource: {},
      },
    };

    return this.processStack(workflow, runExecutionData);
  }

  /** Continues a previously serialized (e.g. JSON round-tripped) run from exactly where it left off. */
  async resume(workflow: IWorkflowBase, runExecutionData: IRunExecutionData): Promise<IRunExecutionData> {
    return this.processStack(workflow, runExecutionData);
  }

  private async processStack(
    workflow: IWorkflowBase,
    runExecutionData: IRunExecutionData,
  ): Promise<IRunExecutionData> {
    const executionData = runExecutionData.executionData!;

    while (executionData.nodeExecutionStack.length > 0) {
      const current = executionData.nodeExecutionStack.pop()!;
      await this.executeNode(workflow, runExecutionData, current);
      if (runExecutionData.resultData.error) break;
    }

    return runExecutionData;
  }

  private async executeNode(
    workflow: IWorkflowBase,
    runExecutionData: IRunExecutionData,
    executionData: IExecuteData,
  ): Promise<void> {
    const { node } = executionData;
    const runData = runExecutionData.resultData.runData;
    const runIndex = runData[node.name]?.length ?? 0;
    const nodeType = this.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);
    const startTime = Date.now();

    const recordTask = (task: Omit<ITaskData, 'startTime' | 'executionTime'>): void => {
      const entry: ITaskData = { startTime, executionTime: Date.now() - startTime, ...task };
      (runData[node.name] ??= []).push(entry);
      runExecutionData.resultData.lastNodeExecuted = node.name;
    };

    if (node.disabled) {
      const passthrough = executionData.data.main[0] ?? [];
      recordTask({ executionStatus: 'success', source: executionData.source?.main ?? [], data: { main: [passthrough] } });
      this.propagate(workflow, runExecutionData, node, runIndex, [passthrough]);
      return;
    }

    const hasParents = hasIncomingConnection(workflow, node.name);
    if (hasParents && totalItemCount(executionData.data.main) === 0) {
      const emptyOutput: NodeOutput = nodeType.description.outputs.map(() => []);
      recordTask({ executionStatus: 'skipped', source: executionData.source?.main ?? [], data: { main: emptyOutput } });
      this.propagate(workflow, runExecutionData, node, runIndex, emptyOutput);
      return;
    }

    const maxTries = node.retryOnFail ? Math.min(Math.max(node.maxTries ?? 3, 1), 5) : 1;
    const sleep = this.options.sleep ?? defaultSleep;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      try {
        const context = buildExecuteFunctions({
          node,
          inputData: executionData.data.main,
          runIndex,
          workflow,
          runData,
          mode: this.options.mode,
          executeOnce: node.executeOnce,
          contextData: runExecutionData.executionData!.contextData,
          credentialsResolver: this.options.credentialsResolver,
          credentialTypes: this.options.credentialTypes,
          httpClient: this.options.httpClient,
        });

        let output = await nodeType.execute!.call(context);

        if (node.alwaysOutputData && output.every((branch) => branch.length === 0)) {
          output = [[{ json: {} }], ...output.slice(1)];
        }

        recordTask({ executionStatus: 'success', source: executionData.source?.main ?? [], data: { main: output } });
        this.propagate(workflow, runExecutionData, node, runIndex, output);
        return;
      } catch (err) {
        if (attempt < maxTries) {
          await sleep(node.waitBetweenTries ?? 0);
          continue;
        }
        this.handleFailure(workflow, runExecutionData, executionData, node, runIndex, err, nodeType.description.outputs.length, recordTask);
        return;
      }
    }
  }

  private handleFailure(
    workflow: IWorkflowBase,
    runExecutionData: IRunExecutionData,
    executionData: IExecuteData,
    node: INode,
    runIndex: number,
    err: unknown,
    outputCount: number,
    recordTask: (task: Omit<ITaskData, 'startTime' | 'executionTime'>) => void,
  ): void {
    const error = toTaskDataError(node, err);
    const onError = node.onError ?? 'stopWorkflow';

    if (onError === 'stopWorkflow') {
      recordTask({ executionStatus: 'error', source: executionData.source?.main ?? [], error });
      runExecutionData.resultData.error = error;
      return;
    }

    const inputItems = executionData.data.main[0] ?? [];
    const taggedItems = tagItemsWithError(inputItems, error);

    if (onError === 'continueErrorOutput' && outputCount >= 2) {
      const output: NodeOutput = [[], taggedItems];
      recordTask({ executionStatus: 'error', source: executionData.source?.main ?? [], error, data: { main: output } });
      this.propagate(workflow, runExecutionData, node, runIndex, output);
      return;
    }

    const output: NodeOutput = [taggedItems];
    recordTask({ executionStatus: 'error', source: executionData.source?.main ?? [], error, data: { main: output } });
    this.propagate(workflow, runExecutionData, node, runIndex, output);
  }

  private propagate(
    workflow: IWorkflowBase,
    runExecutionData: IRunExecutionData,
    node: INode,
    runIndex: number,
    output: NodeOutput,
  ): void {
    const executionData = runExecutionData.executionData!;
    const connectionsFromNode = workflow.connections[node.name];
    if (!connectionsFromNode) return;

    output.forEach((items, outputIndex) => {
      const branchConnections = connectionsFromNode.main[outputIndex] ?? [];

      for (const connection of branchConnections) {
        const targetNode = workflow.nodes.find((candidate) => candidate.name === connection.node);
        if (!targetNode) continue;

        const targetNodeType = this.nodeTypes.getByNameAndVersion(targetNode.type, targetNode.typeVersion);
        const requiredInputs = targetNodeType.description.inputs.length;
        const source: ISourceData = { previousNode: node.name, previousNodeOutput: outputIndex, previousNodeRun: runIndex };

        if (requiredInputs <= 1) {
          // An empty propagation into a node that has already run/skipped at least once is
          // dropped rather than re-queued. Without this, a loop-back edge whose "done" state
          // keeps emitting an empty "continue" branch would re-trigger its own loop body with
          // 0 items forever — the body skips, the skip cascades back into the loop node, which
          // re-emits the same empty branch, ad infinitum. A genuinely new (non-empty) delivery
          // always goes through regardless of history.
          const alreadyRan = (runExecutionData.resultData.runData[targetNode.name]?.length ?? 0) > 0;
          if (items.length === 0 && alreadyRan) continue;

          executionData.nodeExecutionStack.push({
            node: targetNode,
            data: { main: [items] },
            source: { main: [source] },
          });
          continue;
        }

        (executionData.waitingExecution[targetNode.name] ??= {})[connection.index] = items;
        (executionData.waitingExecutionSource[targetNode.name] ??= {})[connection.index] = source;

        const waiting = executionData.waitingExecution[targetNode.name]!;
        const isReady = Array.from({ length: requiredInputs }, (_, i) => i).every((i) => i in waiting);
        if (!isReady) continue;

        const mainData: NodeOutput = [];
        const sourceArr: Array<ISourceData | null> = [];
        for (let i = 0; i < requiredInputs; i++) {
          mainData.push(waiting[i] ?? []);
          sourceArr.push(executionData.waitingExecutionSource[targetNode.name]?.[i] ?? null);
        }

        executionData.nodeExecutionStack.push({ node: targetNode, data: { main: mainData }, source: { main: sourceArr } });
        delete executionData.waitingExecution[targetNode.name];
        delete executionData.waitingExecutionSource[targetNode.name];
      }
    });
  }
}
