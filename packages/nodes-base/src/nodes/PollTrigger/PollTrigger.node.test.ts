import { describe, expect, it } from 'vitest';
import { pollTrigger } from './PollTrigger.node.js';
import { makeNode, makePollFunctions } from '../../test-utils.js';

describe('Poll Trigger node', () => {
  it('emits every item the first time it polls', async () => {
    const node = makeNode({
      name: 'Poll',
      type: 'pollTrigger',
      parameters: { items: JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]) },
    });
    const ctx = makePollFunctions({ node });

    const result = await pollTrigger.poll!.call(ctx);
    expect(result).toEqual([[{ json: { id: 1, name: 'a' } }, { json: { id: 2, name: 'b' } }]]);
  });

  it('returns null when nothing new has appeared since the last poll', async () => {
    const node = makeNode({
      name: 'Poll',
      type: 'pollTrigger',
      parameters: { items: JSON.stringify([{ id: 1 }]) },
    });
    const ctx = makePollFunctions({ node });

    await pollTrigger.poll!.call(ctx);
    const second = await pollTrigger.poll!.call(ctx);
    expect(second).toBeNull();
  });

  it('emits only the newly appeared items on a later poll, using the persisted cursor', async () => {
    const node = makeNode({ name: 'Poll', type: 'pollTrigger', parameters: {} });
    const ctx = makePollFunctions({ node });

    node.parameters.items = JSON.stringify([{ id: 1 }]);
    await pollTrigger.poll!.call(ctx);

    node.parameters.items = JSON.stringify([{ id: 1 }, { id: 2 }]);
    const second = await pollTrigger.poll!.call(ctx);
    expect(second).toEqual([[{ json: { id: 2 } }]]);
  });

  it('persists the seen-id cursor onto workflow static data', async () => {
    const node = makeNode({ name: 'Poll', type: 'pollTrigger', parameters: { items: JSON.stringify([{ id: 'x' }]) } });
    const ctx = makePollFunctions({ node });

    await pollTrigger.poll!.call(ctx);
    expect(ctx.getWorkflowStaticData('node')).toEqual({ seenIds: ['x'] });
  });
});
