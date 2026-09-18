import type { IRunExecutionData } from '@runnel/workflow';

export type NodeRunState = 'running' | 'success' | 'error';

/**
 * What the last real execution did to each node, from its run data: a node's final attempt either
 * errored or produced output. Nodes that didn't run (off the executed branch, after a failure)
 * are simply absent, so the canvas leaves them unmarked rather than implying they passed.
 */
export function nodeRunStates(data: IRunExecutionData | null | undefined): Record<string, Exclude<NodeRunState, 'running'>> {
  const states: Record<string, 'success' | 'error'> = {};
  for (const [name, tasks] of Object.entries(data?.resultData.runData ?? {})) {
    const last = tasks.at(-1);
    if (!last) continue;
    states[name] = last.error || last.executionStatus === 'error' ? 'error' : 'success';
  }
  return states;
}
