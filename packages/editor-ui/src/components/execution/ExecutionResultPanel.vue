<script setup lang="ts">
import { computed, ref } from 'vue';
import { getNodeInputData } from '@n8n-clone/workflow';
import { N8nButton } from '@n8n-clone/design-system';
import { useAssistantStore } from '../../stores/assistant.store.js';
import type { IExecuteWorkflowResult } from '../../api/types.js';

const props = withDefaults(defineProps<{ result: IExecuteWorkflowResult | null; workflowId?: string; title?: string; closable?: boolean }>(), {
  title: 'Execution',
  closable: false,
});
const emit = defineEmits<{ close: [] }>();
const showRaw = ref(false);
const assistantStore = useAssistantStore();

const nodeSummaries = computed(() => {
  const runData = props.result?.data.resultData.runData ?? {};
  return Object.entries(runData).map(([nodeName, tasks]) => {
    const last = tasks.at(-1);
    const itemCount = last?.data?.main.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0;
    return {
      nodeName,
      status: last?.executionStatus ?? 'unknown',
      itemCount,
      error: last?.error?.message,
      errorDescription: last?.error?.description,
    };
  });
});

function onFixThis(summary: { nodeName: string; error?: string; errorDescription?: string }): void {
  if (!props.workflowId || !props.result || !summary.error) return;
  const inputData = getNodeInputData(props.result.data.resultData.runData, summary.nodeName) ?? [];
  void assistantStore.fixExecutionError(
    props.workflowId,
    summary.nodeName,
    { message: summary.error, description: summary.errorDescription },
    inputData,
  );
}
</script>

<template>
  <aside class="execution-panel">
    <div class="execution-panel__header">
      <h2>{{ title }}</h2>
      <button v-if="closable" type="button" class="execution-panel__close" aria-label="Close execution panel" @click="emit('close')">×</button>
    </div>
    <p v-if="!result">Run the workflow to see results here.</p>
    <template v-else>
      <p>
        Status:
        <strong :class="`execution-panel__status--${result.status}`">{{ result.status }}</strong>
      </p>
      <div v-for="summary in nodeSummaries" :key="summary.nodeName" class="execution-panel__node">
        <span>{{ summary.nodeName }}</span>
        <span :class="`execution-panel__status--${summary.status}`">
          {{ summary.status }}<template v-if="summary.status === 'success'"> ({{ summary.itemCount }} items)</template>
        </span>
      </div>
      <div v-for="summary in nodeSummaries.filter((s) => s.error)" :key="`${summary.nodeName}-error`" class="execution-panel__error">
        <p class="auth-error">{{ summary.nodeName }}: {{ summary.error }}</p>
        <N8nButton
          v-if="workflowId"
          variant="secondary"
          :disabled="assistantStore.sending"
          @click="onFixThis(summary)"
        >
          Fix this
        </N8nButton>
      </div>

      <button type="button" class="link-button" @click="showRaw = !showRaw">
        {{ showRaw ? 'Hide' : 'Show' }} raw result
      </button>
      <pre v-if="showRaw" class="execution-panel__raw">{{ JSON.stringify(result, null, 2) }}</pre>
    </template>
  </aside>
</template>
