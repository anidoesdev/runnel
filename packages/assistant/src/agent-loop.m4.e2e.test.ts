import { describe, expect, it } from 'vitest';
import { MapNodeTypes } from '@runnel/core';
import { registerAllNodeTypes } from '@runnel/nodes-base';
import { createToolRegistry, WorkflowDraftStore } from '@runnel/workflow-tools';
import { resumeApproval, resumeAskUser, runTurn } from './agent-loop.js';
import { createSession } from './session.js';
import { ScriptedModelProvider } from './test-utils/scripted-model-provider.js';
import type { IWorkflowBase } from '@runnel/workflow';
import type { ICredentialRepositoryPort, ICredentialSummary, IWorkflowRepositoryPort } from '@runnel/workflow-tools';

/**
 * Milestone 4's own bar: "Agent asks instead of guessing on an underspecified prompt." One
 * continuous conversation exercises every M4 capability against the real tool registry and node
 * catalog: ask_user pausing instead of a guessed answer, request_credential (ungated) running
 * immediately, and remove_node (gated) pausing for explicit approval — including a batch that
 * suspends *again* mid-resume, proving the pause/resume machinery composes rather than only
 * working once.
 */

function fakeWorkflowRepository(seed: IWorkflowBase): IWorkflowRepositoryPort & { saved: IWorkflowBase[] } {
  const saved: IWorkflowBase[] = [];
  let workflow = seed;
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

function fakeCredentialRepository(): ICredentialRepositoryPort & { created: ICredentialSummary[] } {
  const created: ICredentialSummary[] = [];
  return {
    created,
    async list() {
      return [];
    },
    async createPlaceholder(type, name) {
      const summary: ICredentialSummary = { id: `cred-${created.length + 1}`, name, type };
      created.push(summary);
      return summary;
    },
  };
}

describe('agent loop — end to end (Milestone 4)', () => {
  it('asks instead of guessing which Slack channel, then a later batch pauses again for approval before removing a node', async () => {
    const seedWorkflow: IWorkflowBase = {
      id: 'wf-1',
      name: 'My workflow',
      active: false,
      nodes: [{ id: 'n1', name: 'Old Node', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }],
      connections: {},
    };
    const workflowRepo = fakeWorkflowRepository(seedWorkflow);
    const credentialRepo = fakeCredentialRepository();
    const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
    const draftStore = new WorkflowDraftStore(workflowRepo);
    const draft = await draftStore.open('wf-1');
    const tools = createToolRegistry();

    const provider = new ScriptedModelProvider([
      // 1. Ambiguous prompt ("post to slack") — the model asks instead of guessing a channel.
      {
        toolCalls: [
          {
            id: 'call_1',
            name: 'ask_user',
            arguments: JSON.stringify({
              questions: [{ id: 'channel', question: 'Which Slack channel should this post to?', options: [{ label: '#sales', value: 'sales' }] }],
            }),
          },
        ],
      },
      // 2. After the answer: get a credential set up (ungated), and clean up the placeholder
      //    node from before (gated) — in the same batch, so the gate must pause mid-batch.
      {
        toolCalls: [
          // httpHeaderAuth: Slack is reached through the HTTP Request node, and request_credential
          // only accepts a type some registered node actually uses.
          { id: 'call_2', name: 'request_credential', arguments: JSON.stringify({ type: 'httpHeaderAuth' }) },
          { id: 'call_3', name: 'remove_node', arguments: JSON.stringify({ name: 'Old Node' }) },
        ],
      },
      // 3. After approval: final summary.
      { text: 'Set up a Slack credential (finish it at the link) and removed Old Node. Ready to post to #sales once the credential is configured.' },
    ]);
    const deps = { modelProvider: provider, tools, toolContext: { draftId: draft.id, nodeTypes, draftStore, credentials: credentialRepo } };

    const afterAsk = await runTurn(createSession({ id: 's1', workflowId: 'wf-1', draftId: draft.id, actor: { userId: 'u1', scopes: [] }, tokenLimit: 1_000_000 }), 'post to slack when this runs', deps);

    // Paused on ask_user — no guess was made, nothing was mutated.
    expect(afterAsk.status).toBe('awaiting_user');
    expect(afterAsk.pendingQuestions?.questions[0]).toMatchObject({ id: 'channel', question: 'Which Slack channel should this post to?' });
    expect(credentialRepo.created).toHaveLength(0);
    expect(draftStore.get(draft.id).current.nodes).toHaveLength(1); // Old Node still there

    const afterAnswer = await resumeAskUser(afterAsk, { channel: 'sales' }, deps);

    // request_credential (ungated) ran immediately; remove_node (gated) paused the batch.
    expect(credentialRepo.created).toHaveLength(1);
    expect(credentialRepo.created[0]!.type).toBe('httpHeaderAuth');
    expect(afterAnswer.status).toBe('awaiting_approval');
    expect(afterAnswer.pendingApproval).toMatchObject({ toolName: 'remove_node', args: { name: 'Old Node' } });
    expect(draftStore.get(draft.id).current.nodes).toHaveLength(1); // not removed yet — still pending approval

    const finished = await resumeApproval(afterAnswer, 'approve', deps);

    expect(draftStore.get(draft.id).current.nodes).toHaveLength(0); // now actually removed
    expect(finished.status).toBe('idle');
    expect(finished.messages.at(-1)).toMatchObject({ role: 'assistant', content: expect.stringContaining('#sales') });

    // Nothing touched the live workflow until an explicit apply — same rule as Milestone 3.
    expect(workflowRepo.saved).toHaveLength(0);
  });
});
