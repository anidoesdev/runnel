import type { IConnections, INode } from '@n8n-clone/workflow';
import type { ICredentialSummary } from '@n8n-clone/workflow-tools';

/**
 * Scores outcomes, not structure (Part 7): never "did it call add_node with these exact args",
 * always "does the resulting workflow/behavior look right". Each variant checks something a
 * human reviewing the result would actually care about.
 */
export type IEvalAssertion =
  | { type: 'no_tool_errors' }
  | { type: 'uses_node_type'; nodeType: string }
  | { type: 'does_not_use_node_type'; nodeType: string }
  | { type: 'node_count_at_least'; count: number }
  | { type: 'calls_tool'; name: string }
  | { type: 'does_not_call_tool'; name: string }
  | { type: 'ends_idle' }
  | { type: 'max_tool_calls'; count: number }
  | { type: 'node_parameter_equals'; nodeType: string; parameter: string; value: unknown };

export interface IEvalAutoResume {
  answers?: Record<string, string>;
  decision?: 'approve' | 'reject';
}

/**
 * A canned execute_dry_run/execute_live + get_node_output result for one node — keyed by node
 * name on IEvalCase.seedExecutionOutputs. Deliberately not the real execution engine (Part 7:
 * "mock all external APIs at the HTTP layer so runs are deterministic and free") — a case only
 * needs to prove the agent calls the right grounding tools in the right order, not that a real
 * HTTP GET happened; ExecutionAdapter's own tests (packages/cli) cover engine fidelity.
 */
export interface IEvalSeedExecutionOutput {
  schema: Record<string, string>;
  sample: unknown;
  itemCount?: number;
  mocked?: boolean;
  /** When set, run() reports this as the node's error instead of success — for exercising the "retry up to 3 times, then ask_user" correction loop. */
  error?: string;
}

export interface IEvalCase {
  id: string;
  /** Phrased the way a real user actually types, not a precisely-specified instruction — see each cases/*.ts file's own note. */
  prompt: string;
  seedWorkflow?: { nodes: INode[]; connections: IConnections };
  availableCredentials?: ICredentialSummary[];
  seedExecutionOutputs?: Record<string, IEvalSeedExecutionOutput>;
  /** If the turn pauses (ask_user / an approval gate), resolves it once with this before scoring — lets a case exercise the full "ask, then continue" or "gate, then continue" path, not just the pause itself. */
  autoResume?: IEvalAutoResume;
  assertions: IEvalAssertion[];
}

export interface IAssertionResult {
  assertion: IEvalAssertion;
  passed: boolean;
  detail?: string;
}

export interface IEvalCaseResult {
  caseId: string;
  passed: boolean;
  assertionResults: IAssertionResult[];
  toolCallCount: number;
  tokensUsed: number;
  durationMs: number;
  finalStatus: string;
  error?: string;
}

export interface IScorecard {
  total: number;
  passed: number;
  /** The headline number (Part 7): the fraction of cases that needed zero human correction. */
  passRate: number;
  totalToolCalls: number;
  totalTokens: number;
  totalDurationMs: number;
  results: IEvalCaseResult[];
}
