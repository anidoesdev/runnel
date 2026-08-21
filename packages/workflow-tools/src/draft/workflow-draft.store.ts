import { ToolError } from '../errors.js';
import type { IConnection, IDataObject, IWorkflowBase, NodeConnectionType } from '@n8n-clone/workflow';
import type { IWorkflowRepositoryPort } from './workflow-repository.port.js';

export interface IWorkflowDraft {
  id: string;
  workflowId: string;
  /** Snapshot taken when the draft was opened — never mutated, so diff() and discard() always have the true "before" to compare against. */
  baseline: IWorkflowBase;
  /** The agent's working copy. Every tool mutation lands here, never on `baseline` or the real persisted workflow. */
  current: IWorkflowBase;
  createdAt: string;
}

export interface IWorkflowDraftDiffConnection {
  from: string;
  outputIndex: number;
  to: string;
  inputIndex: number;
  type: NodeConnectionType;
}

export interface IWorkflowDraftDiff {
  addedNodes: Array<{ name: string; type: string }>;
  removedNodes: Array<{ name: string; type: string }>;
  /** Field-level before/after breakdown is a UI-layer concern (Milestone 5) — this gives the full parameter objects on both sides, which is enough to compute it. */
  changedNodes: Array<{ name: string; before: IDataObject; after: IDataObject }>;
  addedConnections: IWorkflowDraftDiffConnection[];
  removedConnections: IWorkflowDraftDiffConnection[];
}

/** Duplicates the connection-flattening loop in packages/core's getWorkflowOutline — that version also needs the node registry (for unsetRequiredParams), this one doesn't, so sharing one helper would mean threading an unused nodeTypes param through here. Worth unifying if a third caller shows up. */
function flattenConnections(workflow: IWorkflowBase): IWorkflowDraftDiffConnection[] {
  const flat: IWorkflowDraftDiffConnection[] = [];
  for (const [from, entry] of Object.entries(workflow.connections)) {
    for (const [type, branches] of Object.entries(entry) as Array<[NodeConnectionType, IConnection[][]]>) {
      branches.forEach((branch, outputIndex) => {
        for (const c of branch) flat.push({ from, outputIndex, to: c.node, inputIndex: c.index, type });
      });
    }
  }
  return flat;
}

function connectionKey(c: IWorkflowDraftDiffConnection): string {
  return `${c.from}::${c.outputIndex}::${c.to}::${c.inputIndex}::${c.type}`;
}

function draftNotFound(draftId: string): ToolError {
  return new ToolError({ code: 'DRAFT_NOT_FOUND', message: `No open draft "${draftId}".`, retryable: false });
}

/**
 * Rule #2 from the build prompt: the agent mutates a draft, never the live workflow. Each
 * assistant session opens exactly one draft — a copy-on-write overlay `mutate()` applies
 * functions to, leaving `baseline` (and the real persisted workflow) untouched until `apply()`.
 *
 * In-memory only for now: a draft that outlives the process (e.g. a server restart mid-session)
 * is lost. Persisting drafts is a follow-up once AssistantSession persistence itself is built
 * (Milestone 3) — tracking both independently now would be premature.
 */
export class WorkflowDraftStore {
  private readonly drafts = new Map<string, IWorkflowDraft>();

  constructor(private readonly repository: IWorkflowRepositoryPort) {}

  async open(workflowId: string): Promise<IWorkflowDraft> {
    const baseline = await this.repository.get(workflowId);
    const draft: IWorkflowDraft = {
      id: crypto.randomUUID(),
      workflowId,
      baseline: structuredClone(baseline),
      current: structuredClone(baseline),
      createdAt: new Date().toISOString(),
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  get(draftId: string): IWorkflowDraft {
    const draft = this.drafts.get(draftId);
    if (!draft) throw draftNotFound(draftId);
    return draft;
  }

  /** Non-throwing existence check — lets a caller recover (re-open a fresh draft) instead of failing when a session outlives the in-memory store, e.g. a server restart mid-conversation. */
  has(draftId: string): boolean {
    return this.drafts.has(draftId);
  }

  /** Applies a pure `(workflow) => workflow` mutation to the draft's working copy. */
  mutate(draftId: string, mutation: (workflow: IWorkflowBase) => IWorkflowBase): IWorkflowDraft {
    const draft = this.get(draftId);
    draft.current = mutation(draft.current);
    return draft;
  }

  diff(draftId: string): IWorkflowDraftDiff {
    const draft = this.get(draftId);
    const before = new Map(draft.baseline.nodes.map((n) => [n.name, n]));
    const after = new Map(draft.current.nodes.map((n) => [n.name, n]));

    const addedNodes = draft.current.nodes.filter((n) => !before.has(n.name)).map((n) => ({ name: n.name, type: n.type }));
    const removedNodes = draft.baseline.nodes.filter((n) => !after.has(n.name)).map((n) => ({ name: n.name, type: n.type }));
    const changedNodes = draft.current.nodes
      .filter((n) => {
        const prior = before.get(n.name);
        return prior !== undefined && JSON.stringify(prior.parameters) !== JSON.stringify(n.parameters);
      })
      .map((n) => ({ name: n.name, before: before.get(n.name)!.parameters, after: n.parameters }));

    const beforeConnections = flattenConnections(draft.baseline);
    const afterConnections = flattenConnections(draft.current);
    const beforeKeys = new Set(beforeConnections.map(connectionKey));
    const afterKeys = new Set(afterConnections.map(connectionKey));

    return {
      addedNodes,
      removedNodes,
      changedNodes,
      addedConnections: afterConnections.filter((c) => !beforeKeys.has(connectionKey(c))),
      removedConnections: beforeConnections.filter((c) => !afterKeys.has(connectionKey(c))),
    };
  }

  /** Persists the draft's working copy as the real workflow and forgets the draft. No undo beyond whatever the workflow's own history offers after this. */
  async apply(draftId: string): Promise<IWorkflowBase> {
    const draft = this.get(draftId);
    const saved = await this.repository.save(draft.workflowId, draft.current);
    this.drafts.delete(draftId);
    return saved;
  }

  /** Drops the draft without touching the real workflow. */
  discard(draftId: string): void {
    this.get(draftId);
    this.drafts.delete(draftId);
  }
}
