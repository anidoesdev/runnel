import { describe, expect, it } from 'vitest';
import { getNodeInputData } from './execution-data.js';
import type { ITaskData } from './interfaces/execution.interfaces.js';

function task(overrides: Partial<ITaskData> = {}): ITaskData {
  return { startTime: 0, executionTime: 0, executionStatus: 'success', source: [], ...overrides };
}

describe('getNodeInputData', () => {
  it('returns the previous node\'s recorded output for a single-input node', () => {
    const runData = {
      Trigger: [task({ data: { main: [[{ json: { id: 1 } }]] } })],
      'HTTP Request': [task({ source: [{ previousNode: 'Trigger' }] })],
    };

    expect(getNodeInputData(runData, 'HTTP Request')).toEqual([[{ json: { id: 1 } }]]);
  });

  it('returns one branch per input index for a multi-input node', () => {
    const runData = {
      A: [task({ data: { main: [[{ json: { from: 'a' } }]] } })],
      B: [task({ data: { main: [[{ json: { from: 'b' } }]] } })],
      Merge: [task({ source: [{ previousNode: 'A' }, { previousNode: 'B' }] })],
    };

    expect(getNodeInputData(runData, 'Merge')).toEqual([[{ json: { from: 'a' } }], [{ json: { from: 'b' } }]]);
  });

  it('respects a non-default previousNodeOutput and previousNodeRun', () => {
    const runData = {
      Switch: [
        task({ data: { main: [[{ json: { branch: 0 } }], [{ json: { branch: 1 } }]] } }),
        task({ data: { main: [[{ json: { branch: 0, run: 2 } }], [{ json: { branch: 1, run: 2 } }]] } }),
      ],
      Next: [task({ source: [{ previousNode: 'Switch', previousNodeOutput: 1, previousNodeRun: 1 }] })],
    };

    expect(getNodeInputData(runData, 'Next')).toEqual([[{ json: { branch: 1, run: 2 } }]]);
  });

  it('returns undefined when the node has no recorded task', () => {
    expect(getNodeInputData({}, 'Missing')).toBeUndefined();
  });

  it('returns undefined for a trigger node with no source (nothing fed it)', () => {
    const runData = { Trigger: [task({ source: [] })] };
    expect(getNodeInputData(runData, 'Trigger')).toBeUndefined();
  });

  it('returns an empty branch, not a throw, for a null source entry', () => {
    const runData = { Next: [task({ source: [null] })] };
    expect(getNodeInputData(runData, 'Next')).toEqual([[]]);
  });

  it('returns an empty branch, not a throw, when the referenced previous run/output is missing', () => {
    const runData = {
      A: [task({ data: { main: [[{ json: {} }]] } })],
      Next: [task({ source: [{ previousNode: 'A', previousNodeOutput: 5 } , { previousNode: 'Nonexistent' }] })],
    };

    expect(getNodeInputData(runData, 'Next')).toEqual([[], []]);
  });

  it('uses the last (most recent) run of the target node', () => {
    const runData = {
      A: [task({ data: { main: [[{ json: { v: 'first' } }]] } })],
      Next: [
        task({ source: [{ previousNode: 'A' }] }),
        task({ source: [{ previousNode: 'A' }] }),
      ],
    };
    // Both runs point at A's only recorded run — this test mainly documents that `.at(-1)` on
    // the *target* node's own tasks is what's used, distinct from previousNodeRun on the source.
    expect(getNodeInputData(runData, 'Next')).toEqual([[{ json: { v: 'first' } }]]);
  });
});
