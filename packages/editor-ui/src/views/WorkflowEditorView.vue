<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { N8nButton, N8nCheckbox, N8nInput } from '@n8n-clone/design-system';
import WorkflowCanvas from '../components/canvas/WorkflowCanvas.vue';
import NodePalette from '../components/canvas/NodePalette.vue';
import NodeDetailPanel from '../components/canvas/NodeDetailPanel.vue';
import ExecutionResultPanel from '../components/execution/ExecutionResultPanel.vue';
import ChatPanel from '../components/chat/ChatPanel.vue';
import { useNodeTypesStore } from '../stores/nodeTypes.store.js';
import { useWorkflowStore } from '../stores/workflow.store.js';
import { findChatAgentNode } from '../utils/chatAgent.js';

const route = useRoute();
const router = useRouter();
const workflowStore = useWorkflowStore();
const nodeTypesStore = useNodeTypesStore();

const selectedNodeId = ref<string | null>(null);
const activateError = ref<string | null>(null);

/** The AI Agent node driving the bottom chat dock, once some node feeds it a chat model. */
const chatAgentNode = computed(() => findChatAgentNode(workflowStore.nodes, workflowStore.connections));
const chatPanelOpen = ref(false);

/**
 * Opens the chat dock the moment an agent goes from "no chat model" to "chat model connected" —
 * on load (once loading fills in nodes/connections) and on wiring one up live on the canvas.
 * `immediate` is needed so a workflow that's *already* configured when this view mounts also
 * auto-opens, not just live reconnects; the `!previous` guard then keeps it from popping back
 * open every time the user closes it while nothing about the agent's wiring actually changed.
 */
watch(
  chatAgentNode,
  (node, previous) => {
    if (node && !previous) chatPanelOpen.value = true;
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

function onDropNode(nodeType: string, position: { x: number; y: number }): void {
  const description = nodeTypesStore.byName(nodeType);
  const node = workflowStore.addNode(nodeType, description?.defaults.name ?? nodeType, [position.x, position.y]);
  selectedNodeId.value = node.id;
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
    </header>
    <p v-if="workflowStore.error" class="auth-error">{{ workflowStore.error }}</p>
    <p v-if="activateError" class="auth-error">{{ activateError }}</p>

    <div class="workflow-editor__body" :class="{ 'workflow-editor__body--chat-open': chatPanelOpen && chatAgentNode }">
      <NodePalette />
      <WorkflowCanvas @select-node="selectedNodeId = $event" @drop="onDropNode" />
      <ExecutionResultPanel v-if="!(chatPanelOpen && chatAgentNode)" :result="workflowStore.lastResult" />
    </div>

    <div v-if="chatPanelOpen && chatAgentNode" class="workflow-editor__chat-dock">
      <ChatPanel :agent-node-name="chatAgentNode.name" @close="chatPanelOpen = false" />
      <ExecutionResultPanel title="Logs" :result="workflowStore.lastResult" />
    </div>

    <NodeDetailPanel :node-id="selectedNodeId" @close="selectedNodeId = null" />
  </div>
</template>
