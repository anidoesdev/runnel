import { describe, expect, it } from 'vitest';
import { ScriptedModelProvider } from '../test-utils/scripted-model-provider.js';
import { runEvalCase, runEvalSuite } from './runner.js';
import type { IEvalCase } from './types.js';

/**
 * Smoke-tests the runner mechanics themselves — wiring a fresh draft store, node catalog, and
 * credential fake per case, running the turn, resolving autoResume, and scoring the result —
 * against a ScriptedModelProvider rather than a real (network-calling) one. These are NOT eval
 * cases in the Part 7 sense; they exist to prove the harness works, not to score a prompt.
 */
describe('eval runner', () => {
  it('scores a passing case that builds a node with no pause', async () => {
    const evalCase: IEvalCase = {
      id: 'smoke-add-node',
      prompt: 'add an http request node',
      assertions: [{ type: 'no_tool_errors' }, { type: 'uses_node_type', nodeType: 'httpRequest' }],
    };
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'add_node', arguments: JSON.stringify({ type: 'httpRequest' }) }] },
      { text: 'Added it.' },
    ]);

    const result = await runEvalCase(evalCase, provider);

    expect(result.passed).toBe(true);
    expect(result.finalStatus).toBe('idle');
    expect(result.toolCallCount).toBe(1);
    expect(result.assertionResults.every((r) => r.passed)).toBe(true);
  });

  it('reports a failing assertion without throwing', async () => {
    const evalCase: IEvalCase = {
      id: 'smoke-wrong-node',
      prompt: 'add a code node',
      assertions: [{ type: 'uses_node_type', nodeType: 'httpRequest' }],
    };
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'add_node', arguments: JSON.stringify({ type: 'code' }) }] },
      { text: 'Added it.' },
    ]);

    const result = await runEvalCase(evalCase, provider);

    expect(result.passed).toBe(false);
    expect(result.assertionResults[0]).toMatchObject({ passed: false });
  });

  it('resolves an ask_user autoResume keyed by a different name than the model\'s question id', async () => {
    const evalCase: IEvalCase = {
      id: 'smoke-ask-user',
      prompt: 'run a query against my database',
      autoResume: { answers: { query: 'SELECT 1' } },
      assertions: [{ type: 'calls_tool', name: 'ask_user' }, { type: 'uses_node_type', nodeType: 'postgres' }, { type: 'ends_idle' }],
    };
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'ask_user', arguments: JSON.stringify({ questions: [{ id: 'sql_query', question: 'What query?' }] }) }] },
      { toolCalls: [{ id: 'c2', name: 'add_node', arguments: JSON.stringify({ type: 'postgres', parameters: { query: 'SELECT 1' } }) }] },
      { text: 'Done.' },
    ]);

    const result = await runEvalCase(evalCase, provider);

    expect(result.passed).toBe(true);
    expect(result.finalStatus).toBe('idle');
  });

  it('resolves an approval-gate autoResume and lets the mutation through', async () => {
    const evalCase: IEvalCase = {
      id: 'smoke-approval',
      prompt: 'remove the old node',
      seedWorkflow: { nodes: [{ id: 'n1', name: 'Old', type: 'noOp', typeVersion: 1, position: [0, 0], parameters: {} }], connections: {} },
      autoResume: { decision: 'approve' },
      assertions: [{ type: 'calls_tool', name: 'remove_node' }, { type: 'no_tool_errors' }, { type: 'ends_idle' }],
    };
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'remove_node', arguments: JSON.stringify({ name: 'Old' }) }] },
      { text: 'Removed it.' },
    ]);

    const result = await runEvalCase(evalCase, provider);

    expect(result.passed).toBe(true);
    expect(result.finalStatus).toBe('idle');
  });

  it('wires seedExecutionOutputs into a fake executor that execute_dry_run/get_node_output read from', async () => {
    const evalCase: IEvalCase = {
      id: 'smoke-grounding',
      prompt: 'ground this against the real response from Fetch',
      seedExecutionOutputs: { Fetch: { schema: { id: 'number' }, sample: { id: 1 } } },
      assertions: [{ type: 'calls_tool', name: 'execute_dry_run' }, { type: 'calls_tool', name: 'get_node_output' }, { type: 'no_tool_errors' }],
    };
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'execute_dry_run', arguments: JSON.stringify({ nodeName: 'Fetch' }) }] },
      { toolCalls: [{ id: 'c2', name: 'get_node_output', arguments: JSON.stringify({ nodeName: 'Fetch' }) }] },
      { text: 'The Fetch node returns an `id` field.' },
    ]);

    const result = await runEvalCase(evalCase, provider);

    expect(result.passed).toBe(true);
  });

  it('aggregates a suite of cases into a scorecard', async () => {
    const cases: IEvalCase[] = [
      { id: 'a', prompt: 'add an http request node', assertions: [{ type: 'uses_node_type', nodeType: 'httpRequest' }] },
      { id: 'b', prompt: 'add a code node', assertions: [{ type: 'uses_node_type', nodeType: 'code' }] },
    ];
    const provider = new ScriptedModelProvider([
      { toolCalls: [{ id: 'c1', name: 'add_node', arguments: JSON.stringify({ type: 'httpRequest' }) }] },
      { text: 'Done.' },
      { toolCalls: [{ id: 'c2', name: 'add_node', arguments: JSON.stringify({ type: 'code' }) }] },
      { text: 'Done.' },
    ]);

    const scorecard = await runEvalSuite(cases, provider);

    expect(scorecard.total).toBe(2);
    expect(scorecard.passed).toBe(2);
    expect(scorecard.passRate).toBe(1);
  });
});
