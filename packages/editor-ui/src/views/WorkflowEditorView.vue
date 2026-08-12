<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { N8nButton, N8nCheckbox, N8nInput } from '@n8n-clone/design-system';
import WorkflowCanvas from '../components/canvas/WorkflowCanvas.vue';
import NodePalette from '../components/canvas/NodePalette.vue';
import NodeDetailPanel from '../components/canvas/NodeDetailPanel.vue';
import ExecutionResultPanel from '../components/execution/ExecutionResultPanel.vue';
import { useNodeTypesStore } from '../stores/nodeTypes.store.js';
import { useWorkflowStore } from '../stores/workflow.store.js';

const route = useRoute();
const router = useRouter();
const workflowStore = useWorkflowStore();
const nodeTypesStore = useNodeTypesStore();

const selectedNodeId = ref<string | null>(null);
const activateError = ref<string | null>(null);

onMounted(async () => {
  await nodeTypesStore.load();
  const id = route.params.id;
  if (typeof id === 'string') {
    await workflowStore.load(id);
  } else {
    workflowStore.reset();
  }
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
      <N8nInput v-model="workflowStore.name" placeholder="Workflow name" />
      <N8nCheckbox
        :model-value="workflowStore.active"
        label="Active"
        :disabled="!workflowStore.id"
        @update:model-value="onToggleActive"
      />
      <N8nButton :disabled="workflowStore.saving" @click="onSave">{{ workflowStore.saving ? 'Saving…' : 'Save' }}</N8nButton>
      <N8nButton :disabled="!workflowStore.id || workflowStore.executing" @click="onExecute">
        {{ workflowStore.executing ? 'Running…' : 'Execute Workflow' }}
      </N8nButton>
    </header>
    <p v-if="workflowStore.error" class="auth-error">{{ workflowStore.error }}</p>
    <p v-if="activateError" class="auth-error">{{ activateError }}</p>

    <div class="workflow-editor__body">
      <NodePalette />
      <WorkflowCanvas @select-node="selectedNodeId = $event" @drop="onDropNode" />
      <ExecutionResultPanel :result="workflowStore.lastResult" />
    </div>

    <NodeDetailPanel :node-id="selectedNodeId" @close="selectedNodeId = null" />
  </div>
</template>
