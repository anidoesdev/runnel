import { describe, expect, it } from 'vitest';
import { scoreAssertion, scoreCase } from './scorer.js';
import { createSession } from '../session.js';
import type { IWorkflowBase } from '@n8n-clone/workflow';
import type { IAssistantSession } from '../session.js';

function baseSession(overrides: Partial<IAssistantSession> = {}): IAssistantSession {
  return { ...createSession({ id: 's1', workflowId: 'wf-1', draftId: 'd1', actor: { userId: 'u1', scopes: [] }, tokenLimit: 100_000 }), ...overrides };
}

function draft(nodes: IWorkflowBase['nodes'] = []): IWorkflowBase {
  return { id: 'wf-1', name: 'Test', active: false, nodes, connections: {} };
}

describe('scoreAssertion', () => {
  describe('no_tool_errors', () => {
    it('passes when no tool message is a structured error', () => {
      const session = baseSession({ messages: [{ role: 'tool', toolCallId: 'c1', content: JSON.stringify({ name: 'A' }) }] });
      expect(scoreAssertion({ type: 'no_tool_errors' }, session, draft())).toMatchObject({ passed: true });
    });

    it('fails when a tool message has the {code, retryable} error shape', () => {
      const session = baseSession({
        messages: [{ role: 'tool', toolCallId: 'c1', content: JSON.stringify({ code: 'UNKNOWN_TOOL', message: 'nope', retryable: false }) }],
      });
      const result = scoreAssertion({ type: 'no_tool_errors' }, session, draft());
      expect(result.passed).toBe(false);
      expect(result.detail).toContain('1 tool error');
    });

    it('does not mistake a normal object result for an error', () => {
      // A real tool result could coincidentally have a "code" field without also having "retryable" — must not false-positive.
      const session = baseSession({ messages: [{ role: 'tool', toolCallId: 'c1', content: JSON.stringify({ code: 200 }) }] });
      expect(scoreAssertion({ type: 'no_tool_errors' }, session, draft())).toMatchObject({ passed: true });
    });
  });

  describe('uses_node_type / does_not_use_node_type', () => {
    const d = draft([{ id: 'n1', name: 'A', type: 'httpRequest', typeVersion: 1, position: [0, 0], parameters: {} }]);

    it('uses_node_type passes when present, fails with a detail when absent', () => {
      expect(scoreAssertion({ type: 'uses_node_type', nodeType: 'httpRequest' }, baseSession(), d)).toMatchObject({ passed: true });
      const failed = scoreAssertion({ type: 'uses_node_type', nodeType: 'postgres' }, baseSession(), d);
      expect(failed.passed).toBe(false);
      expect(failed.detail).toContain('postgres');
    });

    it('does_not_use_node_type is the exact inverse', () => {
      expect(scoreAssertion({ type: 'does_not_use_node_type', nodeType: 'httpRequest' }, baseSession(), d)).toMatchObject({ passed: false });
      expect(scoreAssertion({ type: 'does_not_use_node_type', nodeType: 'postgres' }, baseSession(), d)).toMatchObject({ passed: true });
    });
  });

  it('node_count_at_least compares against the draft, not the session', () => {
    const d = draft([
      { id: 'n1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} },
      { id: 'n2', name: 'B', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} },
    ]);
    expect(scoreAssertion({ type: 'node_count_at_least', count: 2 }, baseSession(), d)).toMatchObject({ passed: true });
    expect(scoreAssertion({ type: 'node_count_at_least', count: 3 }, baseSession(), d)).toMatchObject({ passed: false });
  });

  describe('calls_tool / does_not_call_tool', () => {
    const session = baseSession({
      messages: [{ role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'ask_user', arguments: '{}' }] }],
    });

    it('calls_tool passes only when that tool name appears in an assistant message', () => {
      expect(scoreAssertion({ type: 'calls_tool', name: 'ask_user' }, session, draft())).toMatchObject({ passed: true });
      expect(scoreAssertion({ type: 'calls_tool', name: 'remove_node' }, session, draft())).toMatchObject({ passed: false });
    });

    it('stays accurate after an autoResume clears pendingQuestions — reads the transcript, not transient session state', () => {
      const resumedSession = baseSession({
        messages: [
          { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'ask_user', arguments: '{}' }] },
          { role: 'tool', toolCallId: 'c1', content: '{}' },
          { role: 'assistant', content: 'done' },
        ],
        status: 'idle',
        pendingQuestions: undefined,
      });
      expect(scoreAssertion({ type: 'calls_tool', name: 'ask_user' }, resumedSession, draft())).toMatchObject({ passed: true });
    });

    it('does_not_call_tool is the exact inverse', () => {
      expect(scoreAssertion({ type: 'does_not_call_tool', name: 'ask_user' }, session, draft())).toMatchObject({ passed: false });
      expect(scoreAssertion({ type: 'does_not_call_tool', name: 'remove_node' }, session, draft())).toMatchObject({ passed: true });
    });
  });

  describe('ends_idle', () => {
    it('passes only for status idle', () => {
      expect(scoreAssertion({ type: 'ends_idle' }, baseSession({ status: 'idle' }), draft())).toMatchObject({ passed: true });
      const result = scoreAssertion({ type: 'ends_idle' }, baseSession({ status: 'awaiting_approval' }), draft());
      expect(result.passed).toBe(false);
      expect(result.detail).toContain('awaiting_approval');
    });
  });

  it('max_tool_calls counts every tool call across every assistant message', () => {
    const session = baseSession({
      messages: [
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'search_nodes', arguments: '{}' }, { id: 'c2', name: 'add_node', arguments: '{}' }] },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c3', name: 'connect_nodes', arguments: '{}' }] },
      ],
    });
    expect(scoreAssertion({ type: 'max_tool_calls', count: 3 }, session, draft())).toMatchObject({ passed: true });
    expect(scoreAssertion({ type: 'max_tool_calls', count: 2 }, session, draft())).toMatchObject({ passed: false });
  });

  describe('node_parameter_equals', () => {
    it('fails with a detail when no node of that type exists', () => {
      const result = scoreAssertion({ type: 'node_parameter_equals', nodeType: 'httpRequest', parameter: 'url', value: 'x' }, baseSession(), draft());
      expect(result.passed).toBe(false);
      expect(result.detail).toContain('no node of type');
    });

    it('compares by deep equality, not reference', () => {
      const d = draft([{ id: 'n1', name: 'A', type: 'set', typeVersion: 1, position: [0, 0], parameters: { fields: { a: 1 } } }]);
      expect(scoreAssertion({ type: 'node_parameter_equals', nodeType: 'set', parameter: 'fields', value: { a: 1 } }, baseSession(), d)).toMatchObject({
        passed: true,
      });
      expect(scoreAssertion({ type: 'node_parameter_equals', nodeType: 'set', parameter: 'fields', value: { a: 2 } }, baseSession(), d)).toMatchObject({
        passed: false,
      });
    });
  });
});

describe('scoreCase', () => {
  it('scores every assertion independently and preserves order', () => {
    const d = draft([{ id: 'n1', name: 'A', type: 'httpRequest', typeVersion: 1, position: [0, 0], parameters: {} }]);
    const results = scoreCase(
      [
        { type: 'uses_node_type', nodeType: 'httpRequest' },
        { type: 'uses_node_type', nodeType: 'postgres' },
        { type: 'node_count_at_least', count: 1 },
      ],
      baseSession(),
      d,
    );
    expect(results.map((r) => r.passed)).toEqual([true, false, true]);
  });
});
