import type { IWorkflowBase } from '@runnel/workflow';
import type { IAssistantSession } from '../session.js';
import type { IAssertionResult, IEvalAssertion } from './types.js';

function toolErrorCount(session: IAssistantSession): number {
  return session.messages.filter((message) => {
    if (message.role !== 'tool') return false;
    try {
      const parsed = JSON.parse(message.content) as Record<string, unknown>;
      return typeof parsed.code === 'string' && typeof parsed.retryable === 'boolean';
    } catch {
      return false;
    }
  }).length;
}

/** Every tool the model actually called across the whole run, in order — read from the message transcript (not session.pendingApproval/pendingQuestions, which are cleared once resolved) so this stays accurate after an autoResume. */
function calledToolNames(session: IAssistantSession): string[] {
  return session.messages.flatMap((message) => (message.role === 'assistant' ? (message.toolCalls ?? []).map((call) => call.name) : []));
}

export function scoreAssertion(assertion: IEvalAssertion, session: IAssistantSession, draft: IWorkflowBase): IAssertionResult {
  switch (assertion.type) {
    case 'no_tool_errors': {
      const errors = toolErrorCount(session);
      return { assertion, passed: errors === 0, detail: errors > 0 ? `${errors} tool error(s) in the transcript` : undefined };
    }
    case 'uses_node_type': {
      const found = draft.nodes.some((node) => node.type === assertion.nodeType);
      return { assertion, passed: found, detail: found ? undefined : `no node of type "${assertion.nodeType}" in the final draft` };
    }
    case 'does_not_use_node_type': {
      const found = draft.nodes.some((node) => node.type === assertion.nodeType);
      return { assertion, passed: !found, detail: found ? `unexpectedly used node type "${assertion.nodeType}"` : undefined };
    }
    case 'node_count_at_least': {
      const passed = draft.nodes.length >= assertion.count;
      return { assertion, passed, detail: passed ? undefined : `only ${draft.nodes.length} node(s), expected at least ${assertion.count}` };
    }
    case 'calls_tool': {
      const passed = calledToolNames(session).includes(assertion.name);
      return { assertion, passed, detail: passed ? undefined : `never called "${assertion.name}"` };
    }
    case 'does_not_call_tool': {
      const passed = !calledToolNames(session).includes(assertion.name);
      return { assertion, passed, detail: passed ? undefined : `unexpectedly called "${assertion.name}"` };
    }
    case 'ends_idle': {
      const passed = session.status === 'idle';
      return { assertion, passed, detail: passed ? undefined : `session ended in status "${session.status}", not idle` };
    }
    case 'max_tool_calls': {
      const count = calledToolNames(session).length;
      const passed = count <= assertion.count;
      return { assertion, passed, detail: passed ? undefined : `${count} tool calls, expected at most ${assertion.count}` };
    }
    case 'node_parameter_equals': {
      const node = draft.nodes.find((candidate) => candidate.type === assertion.nodeType);
      if (!node) return { assertion, passed: false, detail: `no node of type "${assertion.nodeType}" found` };
      const actual = node.parameters[assertion.parameter];
      const passed = JSON.stringify(actual) === JSON.stringify(assertion.value);
      return {
        assertion,
        passed,
        detail: passed ? undefined : `${assertion.nodeType}.${assertion.parameter} was ${JSON.stringify(actual)}, expected ${JSON.stringify(assertion.value)}`,
      };
    }
  }
}

export function scoreCase(assertions: IEvalAssertion[], session: IAssistantSession, draft: IWorkflowBase): IAssertionResult[] {
  return assertions.map((assertion) => scoreAssertion(assertion, session, draft));
}
