import { MapNodeTypes } from '@runnel/core';
import { registerAllNodeTypes } from '@runnel/nodes-base';
import { createToolRegistry, WorkflowDraftStore } from '@runnel/workflow-tools';
import { resumeApproval, resumeAskUser, runTurn } from '../agent-loop.js';
import { createSession } from '../session.js';
import { renderMemoryBlock } from '../memory-block.js';
import { SYSTEM_PROMPT } from '../prompts/load-system-prompt.js';
import { scoreCase } from './scorer.js';
import type { IConnections, INode, IWorkflowBase } from '@runnel/workflow';
import type {
  ICredentialRepositoryPort,
  ICredentialSummary,
  IWorkflowExecutionSummary,
  IWorkflowExecutorPort,
  IWorkflowRepositoryPort,
} from '@runnel/workflow-tools';
import type { IModelProvider } from '../model-provider.js';
import type { IEvalCase, IEvalCaseResult, IEvalSeedExecutionOutput, IScorecard } from './types.js';

function fakeWorkflowRepository(nodes: INode[], connections: IConnections): IWorkflowRepositoryPort {
  const seed: IWorkflowBase = { id: 'eval-workflow', name: 'Eval workflow', active: false, nodes, connections };
  let workflow = seed;
  return {
    async get() {
      return structuredClone(workflow);
    },
    async save(_id, next) {
      workflow = structuredClone(next);
      return workflow;
    },
  };
}

function fakeCredentialRepository(seed: ICredentialSummary[]): ICredentialRepositoryPort {
  const credentials = [...seed];
  return {
    async list(type) {
      return type ? credentials.filter((c) => c.type === type) : [...credentials];
    },
    async createPlaceholder(type, name) {
      const summary: ICredentialSummary = { id: `cred-${credentials.length + 1}`, name, type };
      credentials.push(summary);
      return summary;
    },
  };
}

/** A canned, non-executing IWorkflowExecutorPort — see IEvalSeedExecutionOutput's own doc comment for why this doesn't run anything real. */
function fakeExecutor(seeds: Record<string, IEvalSeedExecutionOutput>): IWorkflowExecutorPort {
  return {
    async run(destinationNode, dryRun) {
      const seed = seeds[destinationNode];
      const summary: IWorkflowExecutionSummary = {
        status: seed?.error ? 'error' : 'success',
        perNode: {
          [destinationNode]: {
            itemCount: seed?.itemCount ?? 1,
            error: seed?.error,
            mocked: dryRun ? (seed?.mocked ?? false) : false,
          },
        },
      };
      return summary;
    },
    getNodeOutput(nodeName) {
      const seed = seeds[nodeName];
      if (!seed) return undefined;
      return { itemCount: seed.itemCount ?? 1, mocked: seed.mocked ?? false, schema: seed.schema, sample: seed.sample };
    },
  };
}

/**
 * Picks the answer for one pending ask_user question. The case author writes `autoResume.answers`
 * keyed by a semantic name they chose (e.g. `query`), but the real question `id` is whatever the
 * live model generated at runtime and can't be known ahead of time. When there's exactly one
 * pending question and exactly one authored answer, we apply it regardless of key — the common
 * case for every case in clarifying-questions.ts. Anything more ambiguous is a case-authoring
 * error, not something to guess at silently.
 */
function resolveAskUserAnswers(questionIds: string[], authored: Record<string, string>): Record<string, string> {
  const authoredValues = Object.values(authored);
  if (questionIds.length === 1 && authoredValues.length >= 1) {
    return { [questionIds[0]!]: authoredValues[0]! };
  }
  const byId: Record<string, string> = {};
  for (const id of questionIds) {
    if (authored[id] !== undefined) byId[id] = authored[id]!;
  }
  const missing = questionIds.filter((id) => !(id in byId));
  if (missing.length > 0) {
    throw new Error(`autoResume.answers doesn't cover pending question id(s): ${missing.join(', ')}. Authored keys: ${Object.keys(authored).join(', ') || '(none)'}.`);
  }
  return byId;
}

/** Runs one eval case against a real (or scripted, for smoke-testing the runner itself) model provider, then scores the result. Never throws for a failure that belongs in the scorecard — only for a case-authoring bug (autoResume that doesn't match what actually paused). */
export async function runEvalCase(evalCase: IEvalCase, modelProvider: IModelProvider): Promise<IEvalCaseResult> {
  const startedAt = Date.now();
  const nodeTypes = registerAllNodeTypes(new MapNodeTypes());
  const workflowRepo = fakeWorkflowRepository(evalCase.seedWorkflow?.nodes ?? [], evalCase.seedWorkflow?.connections ?? {});
  const credentialRepo = fakeCredentialRepository(evalCase.availableCredentials ?? []);
  const draftStore = new WorkflowDraftStore(workflowRepo);
  const draft = await draftStore.open('eval-workflow');
  const tools = createToolRegistry();
  const executor = fakeExecutor(evalCase.seedExecutionOutputs ?? {});
  const memoryBlock = evalCase.recalledMemories ? renderMemoryBlock(evalCase.recalledMemories) : undefined;
  const deps = {
    modelProvider,
    tools,
    toolContext: { draftId: draft.id, nodeTypes, draftStore, credentials: credentialRepo, executor },
    ...(memoryBlock ? { systemPrompt: `${SYSTEM_PROMPT}

${memoryBlock}` } : {}),
  };
  const session = createSession({ id: `eval-${evalCase.id}`, workflowId: 'eval-workflow', draftId: draft.id, actor: { userId: 'eval', scopes: [] }, tokenLimit: 1_000_000 });

  let error: string | undefined;
  let finished = session;
  try {
    finished = await runTurn(session, evalCase.prompt, deps);

    if (evalCase.autoResume && finished.status === 'awaiting_user' && finished.pendingQuestions) {
      const questionIds = finished.pendingQuestions.questions.map((q) => q.id);
      const answers = resolveAskUserAnswers(questionIds, evalCase.autoResume.answers ?? {});
      finished = await resumeAskUser(finished, answers, deps);
    } else if (evalCase.autoResume?.decision && finished.status === 'awaiting_approval') {
      finished = await resumeApproval(finished, evalCase.autoResume.decision, deps);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const draftAfter = draftStore.get(draft.id).current;
  const assertionResults = scoreCase(evalCase.assertions, finished, draftAfter);
  const passed = error === undefined && assertionResults.every((r) => r.passed);

  return {
    caseId: evalCase.id,
    passed,
    assertionResults,
    toolCallCount: finished.messages.filter((m) => m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0).reduce((sum, m) => sum + (m.toolCalls?.length ?? 0), 0),
    tokensUsed: finished.tokenBudget.used,
    durationMs: Date.now() - startedAt,
    finalStatus: finished.status,
    error,
  };
}

export async function runEvalSuite(cases: IEvalCase[], modelProvider: IModelProvider): Promise<IScorecard> {
  const results: IEvalCaseResult[] = [];
  for (const evalCase of cases) {
    results.push(await runEvalCase(evalCase, modelProvider));
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length > 0 ? passed / results.length : 0,
    totalToolCalls: results.reduce((sum, r) => sum + r.toolCallCount, 0),
    totalTokens: results.reduce((sum, r) => sum + r.tokensUsed, 0),
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    results,
  };
}
