import type { ITaskData } from './interfaces/execution.interfaces.js';
import type { NodeOutput } from './interfaces/common.interfaces.js';

/**
 * Reconstructs the real data a node actually received as input, from `IRunExecutionData`'s
 * `resultData.runData` alone. The engine (packages/core's workflow-execute.ts) never persists a
 * node's input directly — only each `ITaskData.source` pointer (which previous node/output
 * branch/run fed each input index) plus that previous node's own recorded *output*. Walking one
 * hop back through `source` and reading the referenced output is exactly the data the engine fed
 * in; this is a pure read over already-persisted data, not a re-execution.
 *
 * Returns one branch per input index (mirroring `NodeOutput`'s shape) — most nodes have exactly
 * one, a multi-input node like Merge has more. A branch is `[]`, never a thrown error, whenever
 * its source is absent or the referenced previous run/output can't be found (e.g. a trigger node
 * with no input, or execution data trimmed for some other reason).
 */
export function getNodeInputData(runData: Record<string, ITaskData[]>, nodeName: string): NodeOutput | undefined {
  const lastTask = runData[nodeName]?.at(-1);
  if (!lastTask || lastTask.source.length === 0) return undefined;

  return lastTask.source.map((source) => {
    if (!source) return [];
    const previousTask = runData[source.previousNode]?.[source.previousNodeRun ?? 0];
    return previousTask?.data?.main[source.previousNodeOutput ?? 0] ?? [];
  });
}
