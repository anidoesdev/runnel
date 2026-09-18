import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAssistantStore } from './assistant.store.js';
import { useWorkflowStore } from './workflow.store.js';
import { assistantApi } from '../api/assistant.js';
import { workflowsApi } from '../api/workflows.js';
import type { AgentLoopEvent, IAssistantSessionRecord } from '../api/types.js';

vi.mock('../api/assistant.js', () => ({
  assistantApi: {
    createSession: vi.fn(),
    getSession: vi.fn(),
    getDiff: vi.fn(),
    getDraft: vi.fn(),
    applyDraft: vi.fn(),
    sendMessage: vi.fn(),
    submitApproval: vi.fn(),
    submitAnswers: vi.fn(),
  },
}));

vi.mock('../api/workflows.js', () => ({
  workflowsApi: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    execute: vi.fn(),
  },
}));

function baseSession(overrides: Partial<IAssistantSessionRecord> = {}): IAssistantSessionRecord {
  return {
    id: 's1',
    workflowId: 'wf-1',
    draftId: 'd1',
    messages: [],
    actor: { userId: 'u1', scopes: [] },
    tokenBudget: { used: 0, limit: 100_000 },
    status: 'idle',
    createdAt: 't',
    updatedAt: 't',
    ...overrides,
  };
}

describe('assistant store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  describe('open/close', () => {
    it('open() creates a session, opens the panel, and loads the initial draft', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });

      const store = useAssistantStore();
      await store.open('wf-1');

      expect(store.panelOpen).toBe(true);
      expect(store.session?.id).toBe('s1');
      expect(store.draft?.id).toBe('wf-1');
      expect(assistantApi.createSession).toHaveBeenCalledWith('wf-1');
    });

    it('open() reuses the existing session for the same workflow instead of creating a new one', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });

      const store = useAssistantStore();
      await store.open('wf-1');
      await store.open('wf-1');

      expect(assistantApi.createSession).toHaveBeenCalledTimes(1);
    });

    it('close() hides the panel without clearing the session', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });

      const store = useAssistantStore();
      await store.open('wf-1');
      store.close();

      expect(store.panelOpen).toBe(false);
      expect(store.session).not.toBeNull();
    });
  });

  describe('transcript', () => {
    it('pairs a tool_call with its later tool result by id', () => {
      const store = useAssistantStore();
      store.session = baseSession({
        messages: [
          { role: 'user', content: 'add a node' },
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'add_node', arguments: '{"type":"noOp"}' }] },
          { role: 'tool', toolCallId: 'call_1', content: JSON.stringify({ name: 'No Operation' }) },
          { role: 'assistant', content: 'Done.' },
        ],
      });

      expect(store.transcript).toEqual([
        { type: 'user', content: 'add a node' },
        { type: 'tool_call', id: 'call_1', name: 'add_node', args: { type: 'noOp' }, result: { name: 'No Operation' }, error: undefined },
        { type: 'assistant_text', content: 'Done.' },
      ]);
    });

    it('surfaces a tool error result distinctly from a success result', () => {
      const store = useAssistantStore();
      const errorInfo = { code: 'UNKNOWN_TOOL', message: 'nope', retryable: false };
      store.session = baseSession({
        messages: [
          { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'bogus', arguments: '{}' }] },
          { role: 'tool', toolCallId: 'call_1', content: JSON.stringify(errorInfo) },
        ],
      });

      const item = store.transcript[0];
      expect(item).toMatchObject({ type: 'tool_call', error: errorInfo, result: undefined });
    });
  });

  describe('handleEvent', () => {
    it('accumulates text_delta into liveText', () => {
      const store = useAssistantStore();
      store.handleEvent({ type: 'text_delta', text: 'Hel' });
      store.handleEvent({ type: 'text_delta', text: 'lo' });
      expect(store.liveText).toBe('Hello');
    });

    it('tracks a tool_call through running -> success in liveActivity', () => {
      const store = useAssistantStore();
      store.handleEvent({ type: 'tool_call', id: 'c1', name: 'search_nodes', args: { query: 'slack' } });
      expect(store.liveActivity[0]).toMatchObject({ status: 'running' });

      store.handleEvent({ type: 'tool_result', id: 'c1', name: 'search_nodes', result: [] });
      expect(store.liveActivity[0]).toMatchObject({ status: 'success', result: [] });
    });

    it('tracks a tool_call through running -> error in liveActivity', () => {
      const store = useAssistantStore();
      const error = { code: 'UNKNOWN_TOOL', message: 'nope', retryable: false };
      store.handleEvent({ type: 'tool_call', id: 'c1', name: 'bogus', args: {} });
      store.handleEvent({ type: 'tool_error', id: 'c1', name: 'bogus', error });
      expect(store.liveActivity[0]).toMatchObject({ status: 'error', error });
    });

    it('refreshes the draft and pulses the new node on a successful add_node result', async () => {
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      const store = useAssistantStore();
      store.session = baseSession();

      store.handleEvent({ type: 'tool_call', id: 'c1', name: 'add_node', args: { type: 'noOp' } });
      store.handleEvent({ type: 'tool_result', id: 'c1', name: 'add_node', result: { name: 'No Operation' } });

      await vi.waitFor(() => expect(store.pulseNodeNames).toContain('No Operation'));
      expect(assistantApi.getDraft).toHaveBeenCalled();
    });

    it('records approval_required as a pending approval on the session', () => {
      const store = useAssistantStore();
      store.session = baseSession();
      store.handleEvent({ type: 'approval_required', id: 'c1', name: 'remove_node', args: { name: 'A' } });

      expect(store.session?.status).toBe('awaiting_approval');
      expect(store.session?.pendingApproval).toMatchObject({ toolCallId: 'c1', toolName: 'remove_node', args: { name: 'A' } });
    });

    it('records ask_user_required as pending questions on the session', () => {
      const store = useAssistantStore();
      store.session = baseSession();
      const questions = [{ id: 'q1', question: 'Which channel?' }];
      store.handleEvent({ type: 'ask_user_required', id: 'c1', questions });

      expect(store.session?.status).toBe('awaiting_user');
      expect(store.session?.pendingQuestions?.questions).toEqual(questions);
    });

    it('records a top-level error event', () => {
      const store = useAssistantStore();
      store.handleEvent({ type: 'error', message: 'boom' });
      expect(store.error).toBe('boom');
    });
  });

  describe('send / finishTurn', () => {
    it('streams events through handleEvent, then reloads the authoritative session and clears live state', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      vi.mocked(assistantApi.getDiff).mockResolvedValue({ addedNodes: [], removedNodes: [], changedNodes: [], addedConnections: [], removedConnections: [] });

      const finalSession = baseSession({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello.' }] });
      vi.mocked(assistantApi.getSession).mockResolvedValue(finalSession);
      vi.mocked(assistantApi.sendMessage).mockImplementation(async (_id, _msg, onEvent) => {
        onEvent({ type: 'text_delta', text: 'Hello.' } as AgentLoopEvent);
        onEvent({ type: 'turn_complete', stopReason: 'end_turn' } as AgentLoopEvent);
      });

      const store = useAssistantStore();
      await store.open('wf-1');
      await store.send('hi');

      expect(store.sending).toBe(false);
      expect(store.liveText).toBe('');
      expect(store.session).toEqual(finalSession);
    });

    it('records the thrown error and still clears the sending flag when the stream fails', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      vi.mocked(assistantApi.getSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDiff).mockResolvedValue({ addedNodes: [], removedNodes: [], changedNodes: [], addedConnections: [], removedConnections: [] });
      vi.mocked(assistantApi.sendMessage).mockRejectedValue(new Error('network down'));

      const store = useAssistantStore();
      await store.open('wf-1');
      await store.send('hi');

      expect(store.error).toBe('network down');
      expect(store.sending).toBe(false);
    });

    it('is a no-op while a turn is already in flight', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      const store = useAssistantStore();
      await store.open('wf-1');
      store.sending = true;

      await store.send('hi');

      expect(assistantApi.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('fixExecutionError', () => {
    it('opens the session for the workflow and sends a message carrying the real error and input data', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      vi.mocked(assistantApi.getSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDiff).mockResolvedValue({ addedNodes: [], removedNodes: [], changedNodes: [], addedConnections: [], removedConnections: [] });
      vi.mocked(assistantApi.sendMessage).mockResolvedValue(undefined);

      const store = useAssistantStore();
      await store.fixExecutionError('wf-1', 'Fetch Orders', { message: '404 Not Found', description: 'The requested resource was not found.' }, [{ json: { id: 1 } }]);

      expect(assistantApi.createSession).toHaveBeenCalledWith('wf-1');
      expect(assistantApi.sendMessage).toHaveBeenCalledTimes(1);
      const [, message] = vi.mocked(assistantApi.sendMessage).mock.calls[0]!;
      expect(message).toContain('The "Fetch Orders" node failed');
      expect(message).toContain('404 Not Found');
      expect(message).toContain('The requested resource was not found.');
      expect(message).toContain('"id": 1');
    });

    it('reuses the existing session when one is already open for that workflow', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      vi.mocked(assistantApi.getSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDiff).mockResolvedValue({ addedNodes: [], removedNodes: [], changedNodes: [], addedConnections: [], removedConnections: [] });
      vi.mocked(assistantApi.sendMessage).mockResolvedValue(undefined);

      const store = useAssistantStore();
      await store.open('wf-1');
      await store.fixExecutionError('wf-1', 'Fetch Orders', { message: '404 Not Found' }, []);

      expect(assistantApi.createSession).toHaveBeenCalledTimes(1);
    });
  });

  describe('applyDraft', () => {
    it('applies the draft and reloads the live workflow store', async () => {
      vi.mocked(assistantApi.createSession).mockResolvedValue(baseSession());
      vi.mocked(assistantApi.getDraft).mockResolvedValue({ id: 'wf-1', name: 'Test', active: false, nodes: [], connections: {} });
      const applied = { id: 'wf-1', name: 'Test', active: false, nodes: [{ id: 'n1', name: 'A', type: 'noOp', typeVersion: 1, position: [0, 0] as [number, number], parameters: {} }], connections: {} };
      vi.mocked(assistantApi.applyDraft).mockResolvedValue(applied);
      vi.mocked(workflowsApi.get).mockResolvedValue({
        id: 'wf-1',
        name: 'Test',
        active: false,
        nodes: applied.nodes,
        connections: {},
        settings: null,
        staticData: null,
        pinData: null,
    starred: false,
    deletedAt: null,
    folderId: null,
        createdAt: 't',
        updatedAt: 't',
      });

      const assistantStore = useAssistantStore();
      const workflowStore = useWorkflowStore();
      await assistantStore.open('wf-1');
      assistantStore.diff = { addedNodes: [{ name: 'A', type: 'noOp' }], removedNodes: [], changedNodes: [], addedConnections: [], removedConnections: [] };

      await assistantStore.applyDraft();

      expect(assistantStore.diff).toBeNull();
      expect(workflowStore.nodes).toEqual(applied.nodes);
    });
  });
});
