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

/** What a user who only cares about the case's key point says to any other question. */
export const UNSCRIPTED_ANSWER = 'No preference — use a sensible default.';

/**
 * Answers the questions the model actually asked. Question ids are the model's own invention, so a
 * scripted answer is matched to a question by id, then by its key appearing in the id or the
 * question text; with a single question, the first scripted answer is used whatever its key. Any
 * question left over — the model asking something the case didn't anticipate, which is a
 * legitimate thing for it to do — gets UNSCRIPTED_ANSWER rather than aborting the case.
 */
function resolveAskUserAnswers(questions: Array<{ id: string; question: string }>, authored: Record<string, string>): Record<string, string> {
  const authoredEntries = Object.entries(authored);
  if (questions.length === 1 && authoredEntries.length >= 1) {
    return { [questions[0]!.id]: authoredEntries[0]![1] };
  }
  const answers: Record<string, string> = {};
  const unused = new Map(authoredEntries);
  for (const question of questions) {
    const haystack = `${question.id} ${question.question}`.toLowerCase();
    const key = unused.has(question.id) ? question.id : [...unused.keys()].find((candidate) => haystack.includes(candidate.toLowerCase()));
    if (key !== undefined) {
      answers[question.id] = unused.get(key)!;
      unused.delete(key);
    } else {
      answers[question.id] = UNSCRIPTED_ANSWER;
    }
  }
  return answers;
}

/** Runs one eval case against a real (or scripted, for smoke-testing the runner itself) model provider, then scores the result. Never throws for a failure that belongs in the scorecard. */
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
      const answers = resolveAskUserAnswers(finished.pendingQuestions.questions, evalCase.autoResume.answers ?? {});
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
