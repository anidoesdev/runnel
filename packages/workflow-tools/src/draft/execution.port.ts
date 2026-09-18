export interface IWorkflowExecutionNodeSummary {
  itemCount: number;
  error?: string;
  /** True when this node's real execute() was skipped in favor of a passthrough (see INodeType.dryRunSafety in @runnel/workflow) — its data is not real observed output. */
  mocked?: boolean;
}

export interface IWorkflowExecutionSummary {
  status: 'success' | 'error';
  perNode: Record<string, IWorkflowExecutionNodeSummary>;
}

export interface INodeOutputSample {
  itemCount: number;
  mocked: boolean;
  /** Field name -> a coarse type label, inferred from the first item's json. */
  schema: Record<string, string>;
  /** The first item's json, with anything secret-shaped redacted — see redactSample in item-schema.ts. */
  sample: unknown;
}

/**
 * Grounding's execution seam (Part 4 of the build prompt): runs the current draft for real,
 * against real credentials, up to a given node — with `dryRun: true` mocking any node not
 * classified `dryRunSafety => 'safe'` (see @runnel/core's WorkflowExecute). Implemented by
 * packages/cli (it alone can decrypt credentials and drive the execution engine); this package
 * only depends on the shape, same pattern as ICredentialRepositoryPort.
 *
 * One instance is scoped to a single agent turn, not the whole session — `getNodeOutput` reads
 * back whatever `run()` most recently recorded, which only needs to survive within that turn.
 */
export interface IWorkflowExecutorPort {
  run(destinationNode: string, dryRun: boolean): Promise<IWorkflowExecutionSummary>;
  /** Undefined when that node hasn't been part of any `run()` call yet this turn. */
  getNodeOutput(nodeName: string): INodeOutputSample | undefined;
}
