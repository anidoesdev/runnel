import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleTrigger } from './ScheduleTrigger.node.js';
import { makeNode, makeTriggerFunctions } from '../../test-utils.js';
import type { NodeOutput } from '@n8n-clone/workflow';

describe('Schedule Trigger node', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits on the configured interval and stops after closeFunction is called', async () => {
    const node = makeNode({ name: 'Schedule', type: 'scheduleTrigger', parameters: { interval: 5, unit: 'seconds' } });
    const emit = vi.fn();
    const ctx = makeTriggerFunctions({ node, emit });

    const response = await scheduleTrigger.trigger!.call(ctx);
    expect(emit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5000);
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(emit).toHaveBeenCalledTimes(2);

    await response.closeFunction!();
    vi.advanceTimersByTime(20_000);
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('emits with an ISO timestamp payload', async () => {
    const node = makeNode({ name: 'Schedule', type: 'scheduleTrigger', parameters: { interval: 1, unit: 'seconds' } });
    const emit = vi.fn();
    const ctx = makeTriggerFunctions({ node, emit });

    await scheduleTrigger.trigger!.call(ctx);
    vi.advanceTimersByTime(1000);

    const [output] = emit.mock.calls[0] as [NodeOutput];
    const items = output[0]!;
    expect(items).toHaveLength(1);
    expect(typeof items[0]!.json.timestamp).toBe('string');
  });

  it('manualTriggerFunction fires immediately without waiting for the interval', async () => {
    const node = makeNode({ name: 'Schedule', type: 'scheduleTrigger', parameters: { interval: 60, unit: 'minutes' } });
    const emit = vi.fn();
    const ctx = makeTriggerFunctions({ node, emit });

    const response = await scheduleTrigger.trigger!.call(ctx);
    await response.manualTriggerFunction!();
    expect(emit).toHaveBeenCalledTimes(1);

    await response.closeFunction!();
  });
});
