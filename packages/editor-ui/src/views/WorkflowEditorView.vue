<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { N8nButton, N8nCheckbox, N8nInput } from '@n8n-clone/design-system';
import WorkflowCanvas from '../components/canvas/WorkflowCanvas.vue';
import NodePalette from '../components/canvas/NodePalette.vue';
import NodeDetailPanel from '../components/canvas/NodeDetailPanel.vue';
import ExecutionResultPanel from '../components/execution/ExecutionResultPanel.vue';
import ChatPanel from '../components/chat/ChatPanel.vue';
import AssistantPanel from '../components/assistant/AssistantPanel.vue';
import { useNodeTypesStore } from '../stores/nodeTypes.store.js';
import { useWorkflowStore } from '../stores/workflow.store.js';
import { useAssistantStore } from '../stores/assistant.store.js';
import { findChatReadyAgents, findChatTriggerNode, hasMainInput } from '../utils/chatAgent.js';

const route = useRoute();
const router = useRouter();
const workflowStore = useWorkflowStore();
const nodeTypesStore = useNodeTypesStore();
const assistantStore = useAssistantStore();

/**
 * Undefined (not just falsy) whenever the assistant panel is closed or has no draft yet, so
 * WorkflowCanvas falls back to the live, fully-interactive workflow store — both while the
 * panel is opening (no flash of an empty preview) and after it closes (closing must exit
 * preview/readonly mode, not leave the canvas locked with a stale draft forever).
 */
const previewNodes = computed(() => (assistantStore.panelOpen ? assistantStore.draft?.nodes : undefined));
const previewConnections = computed(() => (assistantStore.panelOpen ? assistantStore.draft?.connections : undefined));
/** What's actually on screen right now — the assistant's in-progress draft while it's building, the live workflow otherwise. Chat-readiness must track this, not the live store alone, or an Agent + Chat trigger the assistant just wired up won't open the dock until the draft is applied. */
const effectiveNodes = computed(() => previewNodes.value ?? workflowStore.nodes);
const effectiveConnections = computed(() => previewConnections.value ?? workflowStore.connections);

async function onToggleAssistant(): Promise<void> {
  if (assistantStore.panelOpen) {
    assistantStore.close();
    return;
  }
  if (!workflowStore.id) return;
  await assistantStore.open(workflowStore.id);
}

const selectedNodeId = ref<string | null>(null);
const activateError = ref<string | null>(null);

/** Every AI Agent node that already has a Chat trigger wired into its main input — each is a valid target for the bottom chat dock. */
const chatReadyAgents = computed(() => findChatReadyAgents(effectiveNodes.value, effectiveConnections.value));
/** Explicitly pinned dock target, set whenever some agent newly becomes chat-ready (see watch below) — "most recently wired" wins over whatever was open before. */
const chatDockAgentId = ref<string | null>(null);
const chatAgentNode = computed(() => chatReadyAgents.value.find((node) => node.id === chatDockAgentId.value));
const chatTriggerNode = computed(() =>
  chatAgentNode.value ? findChatTriggerNode(chatAgentNode.value, effectiveNodes.value, effectiveConnections.value) : undefined,
);
const chatPanelOpen = ref(false);
const chatDockVisible = computed(() => chatPanelOpen.value && !!chatAgentNode.value && !!chatTriggerNode.value);

/**
 * Pins the dock to whichever agent just became chat-ready and opens it — covers three cases
 * with one watcher: a workflow that's already wired when this view mounts (`immediate: true`
 * fires with `previousAgents` undefined, so every ready agent counts as "new"), an AI Agent
 * node dropped on the canvas (its Chat trigger is auto-attached synchronously in `onDropNode`,
 * so the pair shows up "newly ready" the next time this computed re-runs), and a Chat node
 * wired up by hand. Deleting the *targeted* agent's Chat trigger drops it out of
 * `chatReadyAgents`, so `chatAgentNode` goes undefined and `chatDockVisible` follows — no extra
 * logic needed to close the dock automatically.
 */
watch(
  chatReadyAgents,
  (agents, previousAgents) => {
    const previousIds = new Set((previousAgents ?? []).map((node) => node.id));
    const justBecameReady = agents.find((node) => !previousIds.has(node.id));
    if (justBecameReady) {
      chatDockAgentId.value = justBecameReady.id;
      chatPanelOpen.value = true;
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await nodeTypesStore.load();
  const id = route.params.id;
  if (typeof id === 'string') {
    await workflowStore.load(id);
  } else {
    workflowStore.reset();
  }
});

/**
 * Autosave: any edit (drag a node, wire a connection, change a parameter, rename the
 * workflow, delete a node, ...) persists on its own a moment after the user stops — no
 * explicit Save click needed. Debounced off the *whole* store state (not just `dirty`, which
 * only flips false->true once) so a burst of changes — e.g. typing in a prompt field —
 * restarts the timer on every keystroke instead of saving mid-word.
 */
const AUTOSAVE_IDLE_MS = 1000;
const AUTOSAVE_RETRY_MS = 300;
let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleAutosave(delayMs = AUTOSAVE_IDLE_MS): void {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (workflowStore.saving) {
      scheduleAutosave(AUTOSAVE_RETRY_MS);
      return;
    }
    if (workflowStore.dirty) void onSave();
  }, delayMs);
}

watch(
  () => workflowStore.$state,
  () => {
    if (workflowStore.dirty) scheduleAutosave();
  },
  { deep: true },
);

onUnmounted(() => {
  if (autosaveTimer) clearTimeout(autosaveTimer);
});

/** Dropping an AI Agent node auto-attaches a Chat trigger to its main input, unless something else is already wired in there. */
function attachChatTrigger(agentNode: { id: string; name: string }, position: { x: number; y: number }): void {
  if (hasMainInput(agentNode.name, workflowStore.connections)) return;
  const chatDescription = nodeTypesStore.byName('chatTrigger');
  const chatNode = workflowStore.addNode('chatTrigger', chatDescription?.defaults.name ?? 'Chat', [position.x - 260, position.y]);
  workflowStore.addConnection(chatNode.name, agentNode.name, 0, 0, 'main');
}

function onDropNode(nodeType: string, position: { x: number; y: number }): void {
  const description = nodeTypesStore.byName(nodeType);
  const node = workflowStore.addNode(nodeType, description?.defaults.name ?? nodeType, [position.x, position.y]);
  selectedNodeId.value = node.id;

  if (nodeType === 'aiAgent') attachChatTrigger(node, position);
}

async function onSave(): Promise<void> {
  try {
    await workflowStore.save();
    if (route.name === 'workflow-new') {
      await router.replace({ name: 'workflow-edit', params: { id: workflowStore.id as string } });
    }
  } catch {
    // workflowStore.error already holds the message; the bar below renders it.
  }
}

async function onToggleActive(active: boolean): Promise<void> {
  activateError.value = null;
  try {
    await workflowStore.setActive(active);
  } catch (err) {
    activateError.value = err instanceof Error ? err.message : String(err);
  }
}

async function onExecute(): Promise<void> {
  try {
    await workflowStore.execute();
  } catch {
    // workflowStore.error already holds the message.
  }
}
</script>

<template>
  <div class="workflow-editor">
    <header class="workflow-editor__bar">
      <N8nButton variant="secondary" @click="router.push({ name: 'workflows' })">← Workflows</N8nButton>
      <N8nInput :model-value="workflowStore.name" placeholder="Workflow name" @update:model-value="workflowStore.setName" />
      <N8nCheckbox
        :model-value="workflowStore.active"
        label="Active"
        :disabled="!workflowStore.id"
        @update:model-value="onToggleActive"
      />
      <span class="workflow-editor__save-status">
        {{ workflowStore.saving ? 'Saving…' : workflowStore.dirty ? 'Unsaved changes' : workflowStore.id ? 'All changes saved' : '' }}
      </span>
      <N8nButton :disabled="workflowStore.saving" @click="onSave">{{ workflowStore.saving ? 'Saving…' : 'Save' }}</N8nButton>
      <N8nButton :disabled="!workflowStore.id || workflowStore.executing" @click="onExecute">
        {{ workflowStore.executing ? 'Running…' : 'Execute Workflow' }}
      </N8nButton>
      <N8nButton v-if="chatAgentNode" variant="secondary" @click="chatPanelOpen = !chatPanelOpen">
        {{ chatPanelOpen ? 'Hide Chat' : 'Show Chat' }}
      </N8nButton>
      <N8nButton variant="secondary" :disabled="!workflowStore.id" :title="!workflowStore.id ? 'Save the workflow first' : ''" @click="onToggleAssistant">
        {{ assistantStore.panelOpen ? 'Hide Assistant' : 'Ask Assistant' }}
      </N8nButton>
    </header>
    <p v-if="workflowStore.error" class="auth-error">{{ workflowStore.error }}</p>
    <p v-if="activateError" class="auth-error">{{ activateError }}</p>

    <div
      class="workflow-editor__body"
      :class="{ 'workflow-editor__body--assistant-open': assistantStore.panelOpen, 'workflow-editor__body--chat-open': !assistantStore.panelOpen && chatDockVisible }"
    >
      <NodePalette />
      <WorkflowCanvas
        :preview-nodes="previewNodes"
        :preview-connections="previewConnections"
        :pulse-node-names="assistantStore.pulseNodeNames"
        :pulse-connection-keys="assistantStore.pulseConnectionKeys"
        @select-node="selectedNodeId = $event"
        @drop="onDropNode"
      />
      <AssistantPanel v-if="assistantStore.panelOpen" />
      <ExecutionResultPanel v-else-if="!chatDockVisible" :result="workflowStore.lastResult" :workflow-id="workflowStore.id ?? undefined" />
    </div>

    <div v-if="chatDockVisible" class="workflow-editor__chat-dock">
      <ChatPanel
        :agent-node-name="chatAgentNode!.name"
        :chat-trigger-node-name="chatTriggerNode!.name"
        @close="chatPanelOpen = false"
      />
      <ExecutionResultPanel title="Logs" :result="workflowStore.lastResult" :workflow-id="workflowStore.id ?? undefined" />
    </div>

    <NodeDetailPanel :node-id="selectedNodeId" @close="selectedNodeId = null" />
  </div>
</template>
