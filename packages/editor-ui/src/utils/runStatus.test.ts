import { describe, expect, it } from 'vitest';
import { nodeRunStates } from './runStatus.js';
import type { IRunExecutionData, ITaskData } from '@runnel/workflow';

function task(overrides: Partial<ITaskData> = {}): ITaskData {
  return { startTime: 0, executionTime: 1, executionStatus: 'success', source: [], data: { main: [[{ json: {} }]] }, ...overrides };
}

function run(runData: Record<string, ITaskData[]>): IRunExecutionData {
  return { resultData: { runData } } as IRunExecutionData;
}

describe('nodeRunStates', () => {
  it('marks nodes that produced output as succeeded and failed ones as errored', () => {
    expect(
      nodeRunStates(run({ Trigger: [task()], Call: [task({ executionStatus: 'error', error: { message: 'boom' } as ITaskData['error'] })] })),
    ).toEqual({ Trigger: 'success', Call: 'error' });
  });

  it('judges a retried node by its last attempt', () => {
    expect(nodeRunStates(run({ Call: [task({ executionStatus: 'error' }), task()] }))).toEqual({ Call: 'success' });
  });

  it('leaves nodes that never ran unmarked, and copes with no result at all', () => {
    expect(nodeRunStates(run({ Trigger: [task()] }))).toEqual({ Trigger: 'success' });
    expect(nodeRunStates(null)).toEqual({});
  });
});
