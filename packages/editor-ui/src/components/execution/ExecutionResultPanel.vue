<script setup lang="ts">
import { computed, ref } from 'vue';
import type { IExecuteWorkflowResult } from '../../api/types.js';

const props = defineProps<{ result: IExecuteWorkflowResult | null }>();
const showRaw = ref(false);

const nodeSummaries = computed(() => {
  const runData = props.result?.data.resultData.runData ?? {};
  return Object.entries(runData).map(([nodeName, tasks]) => {
    const last = tasks.at(-1);
    const itemCount = last?.data?.main.reduce((sum, branch) => sum + (branch?.length ?? 0), 0) ?? 0;
    return { nodeName, status: last?.executionStatus ?? 'unknown', itemCount, error: last?.error?.message };
  });
});
</script>

<template>
  <aside class="execution-panel">
    <h2>Execution</h2>
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
      <p v-for="summary in nodeSummaries.filter((s) => s.error)" :key="`${summary.nodeName}-error`" class="auth-error">
        {{ summary.nodeName }}: {{ summary.error }}
      </p>

      <button type="button" class="link-button" @click="showRaw = !showRaw">
        {{ showRaw ? 'Hide' : 'Show' }} raw result
      </button>
      <pre v-if="showRaw" class="execution-panel__raw">{{ JSON.stringify(result, null, 2) }}</pre>
    </template>
  </aside>
</template>
