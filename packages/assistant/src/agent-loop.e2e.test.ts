import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { registerAllNodeTypes } from '@runnel/nodes-base';
import { createToolRegistry, WorkflowDraftStore } from '@runnel/workflow-tools';
import { runTurn } from './agent-loop.js';
import { createSession, InMemoryAssistantSessionStore } from './session.js';
import { ScriptedModelProvider } from './test-utils/scripted-model-provider.js';
import type { IWorkflowBase } from '@runnel/workflow';
import type { IWorkflowRepositoryPort } from '@runnel/workflow-tools';

/**
 * Milestone 3's own bar: "Builds a 3-node workflow end to end from a prompt, in a test." Runs
 * the real agent loop against the REAL tool registry (Milestone 1 + 2), the REAL node catalog
 * (registerAllNodeTypes, not synthetic fixtures), and a REAL WorkflowDraftStore — only the
 * model itself is faked, scripted to behave the way a competent model actually would: search
 * before guessing a type, batch related tool calls together, and finish with a text summary.
 * Also exercises the two other Milestone 3 capabilities beyond the loop itself: session
 * persistence (save, "reload" via a fresh fetch) and applying the draft to the live workflow.
 */

function fakeRepository(): IWorkflowRepositoryPort & { saved: IWorkflowBase[] } {
  const saved: IWorkflowBase[] = [];
  let workflow: IWorkflowBase = { id: 'wf-1', name: 'My workflow', active: false, nodes: [], connections: {} };
  return {
    saved,
    async get() {
      return structuredClone(workflow);
    },
    async save(_id, next) {
      workflow = structuredClone(next);
      saved.push(workflow);
      return workflow;
    },
  };
}

describe('agent loop — end to end (Milestone 3)', () => {
  it('builds Manual Trigger → HTTP Request → Set from a single prompt, across several tool-calling round trips', async () => {
    const repository = fakeRepository();
    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const draftStore = new WorkflowDraftStore(repository);
    const draft = await draftStore.open('wf-1');
    const tools = createToolRegistry();
    const sessionStore = new InMemoryAssistantSessionStore();

    const session = await sessionStore.create(
      createSession({ id: 'session-1', workflowId: 'wf-1', draftId: draft.id, actor: { userId: 'u1', scopes: [] }, tokenLimit: 1_000_000 }),
    );

    const provider = new ScriptedModelProvider([
      // 1. Search before guessing any type string.
      {
        toolCalls: [
          { id: 'call_1', name: 'search_nodes', arguments: JSON.stringify({ query: 'run this manually' }) },
          { id: 'call_2', name: 'search_nodes', arguments: JSON.stringify({ query: 'call a rest api' }) },
          { id: 'call_3', name: 'search_nodes', arguments: JSON.stringify({ query: 'edit fields on an item' }) },
        ],
      },
      // 2. Build the skeleton — three nodes, no parameters yet.
      {
        toolCalls: [
          { id: 'call_4', name: 'add_node', arguments: JSON.stringify({ type: 'manualTrigger' }) },
          { id: 'call_5', name: 'add_node', arguments: JSON.stringify({ type: 'httpRequest', name: 'Call API' }) },
          { id: 'call_6', name: 'add_node', arguments: JSON.stringify({ type: 'set', name: 'Extract Result' }) },
        ],
      },
      // 3. Wire it up and configure.
      {
        toolCalls: [
          { id: 'call_7', name: 'connect_nodes', arguments: JSON.stringify({ from: 'Manual Trigger', to: 'Call API' }) },
          { id: 'call_8', name: 'connect_nodes', arguments: JSON.stringify({ from: 'Call API', to: 'Extract Result' }) },
          {
            id: 'call_9',
            name: 'set_node_parameters',
            arguments: JSON.stringify({ name: 'Call API', parameters: { method: 'GET', url: 'https://example.com/users' } }),
          },
          {
            id: 'call_10',
            name: 'set_node_parameters',
            arguments: JSON.stringify({
              name: 'Extract Result',
              parameters: { mode: 'manual', fields: { values: [{ name: 'result', type: 'string', value: '={{ $json.body }}' }] } },
            }),
          },
        ],
      },
      // 4. Review before reporting done.
      { toolCalls: [{ id: 'call_11', name: 'get_workflow_outline', arguments: '{}' }] },
      // 5. Final summary — no more tool calls, turn ends.
      { text: 'Built a 3-node workflow: Manual Trigger → Call API → Extract Result. Review the URL and mapped field before running it.' },
    ]);

    const finished = await runTurn(
      session,
      'When I manually trigger it, call https://example.com/users and put the response body into a "result" field.',
      { modelProvider: provider, tools, toolContext: { draftId: draft.id, nodeTypes, draftStore } },
    );

    // The loop actually built the workflow — on the draft, not the live document yet.
    const built = draftStore.get(draft.id).current;
    expect(built.nodes.map((n) => ({ name: n.name, type: n.type }))).toEqual([
      { name: 'Manual Trigger', type: 'manualTrigger' },
      { name: 'Call API', type: 'httpRequest' },
      { name: 'Extract Result', type: 'set' },
    ]);
    expect(built.connections['Manual Trigger']?.main?.[0]).toEqual([{ node: 'Call API', type: 'main', index: 0 }]);
    expect(built.connections['Call API']?.main?.[0]).toEqual([{ node: 'Extract Result', type: 'main', index: 0 }]);
    expect(built.nodes.find((n) => n.name === 'Call API')?.parameters.url).toBe('https://example.com/users');

    // The loop ended cleanly with a text summary, not mid-tool-call.
    expect(finished.status).toBe('idle');
    expect(finished.messages.at(-1)).toMatchObject({ role: 'assistant', content: expect.stringContaining('3-node workflow') });
    expect(repository.saved).toHaveLength(0); // nothing persisted to the live workflow until the draft is applied

    // Session persistence: save, then resume as if the page had reloaded.
    await sessionStore.save(finished);
    const resumed = await sessionStore.get('session-1');
    expect(resumed?.messages).toEqual(finished.messages);
    expect(resumed?.draftId).toBe(draft.id);

    // Applying the draft is a separate, explicit step (rule #2: never touch the live workflow implicitly).
    const applied = await draftStore.apply(draft.id);
    expect(applied.nodes).toHaveLength(3);
    expect(repository.saved).toHaveLength(1);
  });
});
