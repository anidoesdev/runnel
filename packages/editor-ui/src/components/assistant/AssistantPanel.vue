<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { N8nButton, N8nInput } from '@n8n-clone/design-system';
import { useAssistantStore } from '../../stores/assistant.store.js';
import { diffFields, humanizeToolCall } from '../../utils/assistantDisplay.js';

const assistantStore = useAssistantStore();

const draft = ref('');
const answers = ref<Record<string, string>>({});
const listEl = ref<HTMLElement | null>(null);

const inputDisabled = computed(
  () => assistantStore.sending || assistantStore.session?.status === 'awaiting_approval' || assistantStore.session?.status === 'awaiting_user',
);

const diffHasChanges = computed(() => {
  const diff = assistantStore.diff;
  if (!diff) return false;
  return diff.addedNodes.length > 0 || diff.removedNodes.length > 0 || diff.changedNodes.length > 0 || diff.addedConnections.length > 0 || diff.removedConnections.length > 0;
});

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

watch(
  () => assistantStore.session?.pendingQuestions,
  () => {
    answers.value = {};
  },
);

watch([() => assistantStore.transcript.length, () => assistantStore.liveText, () => assistantStore.liveActivity.length], scrollToBottom);

async function onSend(): Promise<void> {
  const text = draft.value.trim();
  if (!text) return;
  draft.value = '';
  await assistantStore.send(text);
}

function selectOption(questionId: string, value: string): void {
  answers.value[questionId] = value;
}

const allQuestionsAnswered = computed(() => {
  const questions = assistantStore.session?.pendingQuestions?.questions ?? [];
  return questions.length > 0 && questions.every((q) => (answers.value[q.id] ?? '').trim().length > 0);
});

async function onSubmitAnswers(): Promise<void> {
  if (!allQuestionsAnswered.value) return;
  await assistantStore.answerQuestions({ ...answers.value });
}

async function onApprove(): Promise<void> {
  await assistantStore.resolveApproval('approve');
}

async function onReject(): Promise<void> {
  await assistantStore.resolveApproval('reject');
}

async function onApply(): Promise<void> {
  await assistantStore.applyDraft();
}
</script>

<template>
  <aside class="assistant-panel">
    <header class="assistant-panel__bar">
      <h2>Assistant</h2>
      <button type="button" class="assistant-panel__close" aria-label="Close assistant" @click="assistantStore.close()">×</button>
    </header>

    <div ref="listEl" class="assistant-panel__transcript">
      <p v-if="assistantStore.transcript.length === 0 && !assistantStore.liveText && assistantStore.liveActivity.length === 0" class="assistant-panel__empty">
        Describe what you want to automate.
      </p>

      <template v-for="(item, index) in assistantStore.transcript" :key="index">
        <div v-if="item.type === 'user'" class="assistant-panel__bubble assistant-panel__bubble--user">{{ item.content }}</div>
        <div v-else-if="item.type === 'assistant_text'" class="assistant-panel__bubble assistant-panel__bubble--assistant">{{ item.content }}</div>
        <div v-else class="assistant-panel__tool-row" :class="{ 'assistant-panel__tool-row--error': item.error }">
          {{ humanizeToolCall(item.name, item.args, item.result, false) }}
          <span v-if="item.error" class="assistant-panel__tool-row-detail">{{ item.error.message }}</span>
        </div>
      </template>

      <div v-if="assistantStore.liveText" class="assistant-panel__bubble assistant-panel__bubble--assistant">{{ assistantStore.liveText }}</div>
      <div
        v-for="activity in assistantStore.liveActivity"
        :key="activity.id"
        class="assistant-panel__tool-row"
        :class="{ 'assistant-panel__tool-row--running': activity.status === 'running', 'assistant-panel__tool-row--error': activity.status === 'error' }"
      >
        {{ humanizeToolCall(activity.name, activity.args, activity.result, activity.status === 'running') }}
        <span v-if="activity.error" class="assistant-panel__tool-row-detail">{{ activity.error.message }}</span>
      </div>

      <div v-if="assistantStore.sending && !assistantStore.liveText" class="assistant-panel__bubble assistant-panel__bubble--assistant assistant-panel__bubble--pending">
        Thinking…
      </div>

      <div v-if="assistantStore.session?.status === 'awaiting_user' && assistantStore.session.pendingQuestions" class="assistant-panel__questions">
        <div v-for="question in assistantStore.session.pendingQuestions.questions" :key="question.id" class="assistant-panel__question">
          <p>{{ question.question }}</p>
          <div v-if="question.options?.length" class="assistant-panel__chips">
            <button
              v-for="option in question.options"
              :key="option.value"
              type="button"
              class="assistant-panel__chip"
              :class="{ 'assistant-panel__chip--selected': answers[question.id] === option.value }"
              :title="option.description"
              @click="selectOption(question.id, option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <N8nInput
            v-if="question.allowFreeText || !question.options?.length"
            :model-value="answers[question.id] ?? ''"
            placeholder="Type an answer…"
            @update:model-value="(v) => (answers[question.id] = v)"
          />
        </div>
        <N8nButton :disabled="!allQuestionsAnswered || assistantStore.sending" @click="onSubmitAnswers">Send answers</N8nButton>
      </div>

      <div v-if="assistantStore.session?.status === 'awaiting_approval' && assistantStore.session.pendingApproval" class="assistant-panel__approval">
        <p>
          {{ humanizeToolCall(assistantStore.session.pendingApproval.toolName, assistantStore.session.pendingApproval.args, undefined, false) }}
          — approve this change?
        </p>
        <div class="assistant-panel__approval-actions">
          <N8nButton :disabled="assistantStore.sending" @click="onApprove">Approve</N8nButton>
          <N8nButton variant="secondary" :disabled="assistantStore.sending" @click="onReject">Reject</N8nButton>
        </div>
      </div>
    </div>

    <p v-if="assistantStore.error" class="auth-error">{{ assistantStore.error }}</p>

    <div v-if="diffHasChanges" class="assistant-panel__diff">
      <h3>Changes not yet applied</h3>
      <ul class="assistant-panel__diff-list">
        <li v-for="node in assistantStore.diff!.addedNodes" :key="`added-${node.name}`" class="assistant-panel__diff-item assistant-panel__diff-item--added">
          + {{ node.name }} ({{ node.type }})
        </li>
        <li v-for="node in assistantStore.diff!.removedNodes" :key="`removed-${node.name}`" class="assistant-panel__diff-item assistant-panel__diff-item--removed">
          − {{ node.name }} ({{ node.type }})
        </li>
        <li v-for="node in assistantStore.diff!.changedNodes" :key="`changed-${node.name}`" class="assistant-panel__diff-item assistant-panel__diff-item--changed">
          ~ {{ node.name }}
          <ul class="assistant-panel__diff-fields">
            <li v-for="field in diffFields(node.before, node.after)" :key="field.key">
              {{ field.key }}: {{ JSON.stringify(field.before) }} → {{ JSON.stringify(field.after) }}
            </li>
          </ul>
        </li>
        <li v-for="c in assistantStore.diff!.addedConnections" :key="`conn-added-${c.from}-${c.to}-${c.type}`" class="assistant-panel__diff-item assistant-panel__diff-item--added">
          + {{ c.from }} → {{ c.to }}
        </li>
        <li v-for="c in assistantStore.diff!.removedConnections" :key="`conn-removed-${c.from}-${c.to}-${c.type}`" class="assistant-panel__diff-item assistant-panel__diff-item--removed">
          − {{ c.from }} → {{ c.to }}
        </li>
      </ul>
      <N8nButton :disabled="assistantStore.sending" @click="onApply">Apply to workflow</N8nButton>
    </div>

    <form class="assistant-panel__input" @submit.prevent="onSend">
      <N8nInput :model-value="draft" placeholder="Describe what you want to automate…" :disabled="inputDisabled" @update:model-value="draft = $event" />
      <N8nButton :disabled="inputDisabled || !draft.trim()">Send</N8nButton>
    </form>
  </aside>
</template>
