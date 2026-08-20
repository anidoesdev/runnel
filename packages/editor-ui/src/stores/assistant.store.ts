import { defineStore } from 'pinia';
import { assistantApi } from '../api/assistant.js';
import { useWorkflowStore } from './workflow.store.js';
import type {
  AgentLoopEvent,
  IAskUserQuestion,
  IAssistantMessage,
  IAssistantSessionRecord,
  IDraftWorkflow,
  IToolErrorInfo,
  IWorkflowDraftDiff,
} from '../api/types.js';

/** Tools whose success should refresh the canvas preview and pulse whatever they touched. */
const MUTATING_TOOLS = new Set([
  'add_node',
  'connect_nodes',
  'disconnect_nodes',
  'set_node_parameters',
  'rename_node',
  'remove_node',
  'set_node_credential',
]);

const PULSE_DURATION_MS = 2000;

export interface IAssistantActivityItem {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  args?: unknown;
  result?: unknown;
  error?: IToolErrorInfo;
}

/** One entry in the rendered transcript — derived from session.messages (see `transcript` getter), not stored directly. */
export type AssistantTranscriptItem =
  | { type: 'user'; content: string }
  | { type: 'assistant_text'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown; result?: unknown; error?: IToolErrorInfo };

function parseArgs(raw: string): unknown {
  try {
    return raw.length > 0 ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Best-effort "what node did this touch" for the pulse animation — every mutating tool takes a `name` except add_node (uses the returned name) and connect_nodes/disconnect_nodes (uses `from`/`to`). Never throws on an unexpected shape; just skips the pulse. */
function pulseTargetsFor(name: string, args: unknown, result: unknown): { nodes: string[]; connections: string[] } {
  const a = (args ?? {}) as Record<string, unknown>;
  const r = (result ?? {}) as Record<string, unknown>;
  switch (name) {
    case 'add_node':
      return { nodes: typeof r.name === 'string' ? [r.name] : [], connections: [] };
    case 'connect_nodes':
      return {
        nodes: [],
        connections: typeof a.from === 'string' && typeof a.to === 'string' ? [`${a.from}->${a.to}`] : [],
      };
    case 'disconnect_nodes':
      return { nodes: [], connections: [] };
    case 'rename_node':
      return { nodes: typeof a.newName === 'string' ? [a.newName] : [], connections: [] };
    case 'set_node_parameters':
    case 'set_node_credential':
      return { nodes: typeof a.name === 'string' ? [a.name] : [], connections: [] };
    default:
      return { nodes: [], connections: [] };
  }
}

export const useAssistantStore = defineStore('assistant', {
  state: () => ({
    session: null as IAssistantSessionRecord | null,
    panelOpen: false,
    sending: false,
    /** Accumulates the current turn's assistant text as it streams in; folded into `session.messages` once the turn ends and the session is refetched. */
    liveText: '',
    /** Tool calls made during the current in-flight turn, not yet reflected in `session.messages`. */
    liveActivity: [] as IAssistantActivityItem[],
    error: null as string | null,
    diff: null as IWorkflowDraftDiff | null,
    draft: null as IDraftWorkflow | null,
    pulseNodeNames: [] as string[],
    pulseConnectionKeys: [] as string[],
  }),
  getters: {
    /** The stable, replayable chat history — every past turn's text and tool calls, paired with their results. Rebuilt from session.messages on every access rather than kept as separate state, so there's exactly one source of truth for "what happened". */
    transcript(state): AssistantTranscriptItem[] {
      const messages = state.session?.messages ?? [];
      const resultByCallId = new Map<string, { content: string; isError: boolean }>();
      for (const message of messages) {
        if (message.role === 'tool' && message.toolCallId) {
          resultByCallId.set(message.toolCallId, { content: message.content, isError: false });
        }
      }

      const items: AssistantTranscriptItem[] = [];
      for (const message of messages) {
        if (message.role === 'user') {
          items.push({ type: 'user', content: message.content });
        } else if (message.role === 'assistant') {
          if (message.content) items.push({ type: 'assistant_text', content: message.content });
          for (const call of message.toolCalls ?? []) {
            const raw = resultByCallId.get(call.id);
            let result: unknown;
            let error: IToolErrorInfo | undefined;
            if (raw) {
              const parsed = JSON.parse(raw.content) as unknown;
              if (parsed && typeof parsed === 'object' && 'code' in parsed && 'retryable' in parsed) {
                error = parsed as IToolErrorInfo;
              } else {
                result = parsed;
              }
            }
            items.push({ type: 'tool_call', id: call.id, name: call.name, args: parseArgs(call.arguments), result, error });
          }
        }
      }
      return items;
    },
  },
  actions: {
    reset(): void {
      this.session = null;
      this.panelOpen = false;
      this.sending = false;
      this.liveText = '';
      this.liveActivity = [];
      this.error = null;
      this.diff = null;
      this.draft = null;
      this.pulseNodeNames = [];
      this.pulseConnectionKeys = [];
    },

    async open(workflowId: string): Promise<void> {
      this.panelOpen = true;
      if (this.session && this.session.workflowId === workflowId) return;
      this.error = null;
      this.session = await assistantApi.createSession(workflowId);
      await this.refreshDraft();
    },

    close(): void {
      this.panelOpen = false;
    },

    async refreshDraft(): Promise<void> {
      if (!this.session) return;
      this.draft = await assistantApi.getDraft(this.session.id);
    },

    async refreshDiff(): Promise<void> {
      if (!this.session) return;
      this.diff = await assistantApi.getDiff(this.session.id);
    },

    markPulse(nodes: string[], connections: string[]): void {
      this.pulseNodeNames.push(...nodes);
      this.pulseConnectionKeys.push(...connections);
      setTimeout(() => {
        this.pulseNodeNames = this.pulseNodeNames.filter((n) => !nodes.includes(n));
        this.pulseConnectionKeys = this.pulseConnectionKeys.filter((c) => !connections.includes(c));
      }, PULSE_DURATION_MS);
    },

    /** Shared by every event-driven route (send/approve/answer) — updates live streaming state, refreshes the draft/pulse on a successful mutating tool call, and records a suspend point on the session itself so the UI can render an approval card or question chips immediately, without waiting for the next GET. */
    handleEvent(event: AgentLoopEvent): void {
      switch (event.type) {
        case 'text_delta':
          this.liveText += event.text;
          break;
        case 'tool_call':
          this.liveActivity.push({ id: event.id, name: event.name, status: 'running', args: event.args });
          break;
        case 'tool_result': {
          const item = this.liveActivity.find((a) => a.id === event.id);
          if (item) {
            item.status = 'success';
            item.result = event.result;
          }
          if (MUTATING_TOOLS.has(event.name)) {
            const targets = pulseTargetsFor(event.name, item?.args, event.result);
            void this.refreshDraft().then(() => this.markPulse(targets.nodes, targets.connections));
          }
          break;
        }
        case 'tool_error': {
          const item = this.liveActivity.find((a) => a.id === event.id);
          if (item) {
            item.status = 'error';
            item.error = event.error;
          }
          break;
        }
        case 'approval_required':
          if (this.session) {
            this.session.status = 'awaiting_approval';
            this.session.pendingApproval = { toolCallId: event.id, toolName: event.name, args: event.args, remainingCalls: [] };
          }
          break;
        case 'ask_user_required':
          if (this.session) {
            this.session.status = 'awaiting_user';
            this.session.pendingQuestions = { toolCallId: event.id, questions: event.questions, remainingCalls: [] };
          }
          break;
        case 'error':
          this.error = event.message;
          break;
        case 'turn_complete':
          break;
      }
    },

    /** Runs after any stream ends (success or failure) — reloads the authoritative session (folding `liveText`/`liveActivity` into the real transcript) and clears the live buffers. */
    async finishTurn(): Promise<void> {
      if (this.session) {
        try {
          this.session = await assistantApi.getSession(this.session.id);
          await this.refreshDiff();
        } catch {
          // Keep the locally-known session state (with liveText/liveActivity still visible)
          // rather than losing the turn's content to a transient refetch failure.
        }
      }
      this.liveText = '';
      this.liveActivity = [];
      this.sending = false;
    },

    /**
     * The "Fix this" entry point (build prompt Milestone 8): opens/reuses the session for this
     * workflow, then sends a single composed message carrying the real failure — the node name,
     * the engine's own error text, and the actual input data that node received (reconstructed
     * from the execution's runData, not re-guessed) — so the agent's very first turn is grounded
     * in what really happened instead of the user re-typing the error by hand.
     */
    async fixExecutionError(
      workflowId: string,
      nodeName: string,
      error: { message: string; description?: string },
      inputData: unknown,
    ): Promise<void> {
      await this.open(workflowId);
      const lines = [
        `The "${nodeName}" node failed when I ran this workflow.`,
        `Error: ${error.message}`,
        ...(error.description ? [error.description] : []),
        '',
        `Here is the real input data "${nodeName}" received:`,
        '```json',
        JSON.stringify(inputData, null, 2),
        '```',
        '',
        'Please diagnose what went wrong and fix it.',
      ];
      await this.send(lines.join('\n'));
    },

    async send(message: string): Promise<void> {
      if (!this.session || this.sending) return;
      this.sending = true;
      this.error = null;
      try {
        await assistantApi.sendMessage(this.session.id, message, (event) => this.handleEvent(event));
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        await this.finishTurn();
      }
    },

    async answerQuestions(answers: Record<string, string>): Promise<void> {
      if (!this.session || this.sending) return;
      this.sending = true;
      this.error = null;
      try {
        await assistantApi.submitAnswers(this.session.id, answers, (event) => this.handleEvent(event));
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        await this.finishTurn();
      }
    },

    async resolveApproval(decision: 'approve' | 'reject'): Promise<void> {
      if (!this.session || this.sending) return;
      this.sending = true;
      this.error = null;
      try {
        await assistantApi.submitApproval(this.session.id, decision, (event) => this.handleEvent(event));
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        await this.finishTurn();
      }
    },

    /** Rule #2: applying is the one explicit, user-initiated action that writes the draft to the live workflow — reloading the workflow store here (rather than leaving the caller to remember to) is what makes the canvas correctly show the applied state once preview mode exits. */
    async applyDraft(): Promise<IDraftWorkflow | undefined> {
      if (!this.session) return undefined;
      const applied = await assistantApi.applyDraft(this.session.id);
      this.diff = null;
      await useWorkflowStore().load(this.session.workflowId);
      return applied;
    },
  },
});

export type { IAskUserQuestion, IAssistantMessage };
