<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { RunnelButton, RunnelInput } from '@runnel/design-system';
import { useWorkflowStore } from '../../stores/workflow.store.js';

const props = defineProps<{ agentNodeName: string; chatTriggerNodeName: string }>();
defineEmits<{ close: [] }>();

const workflowStore = useWorkflowStore();

interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  content: string;
}

const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const listEl = ref<HTMLElement | null>(null);

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

async function onSend(): Promise<void> {
  const text = draft.value.trim();
  if (!text || workflowStore.executing) return;

  messages.value.push({ role: 'user', content: text });
  draft.value = '';
  await scrollToBottom();

  try {
    const { output } = await workflowStore.runChat(props.chatTriggerNodeName, props.agentNodeName, text);
    messages.value.push({ role: 'assistant', content: output || '(No answer returned.)' });
  } catch (err) {
    messages.value.push({ role: 'error', content: err instanceof Error ? err.message : String(err) });
  } finally {
    await scrollToBottom();
  }
}
</script>

<template>
  <section class="chat-panel">
    <header class="chat-panel__bar">
      <h2>Chat — {{ agentNodeName }}</h2>
      <button type="button" class="icon-button" aria-label="Close chat" @click="$emit('close')">×</button>
    </header>

    <div ref="listEl" class="chat-panel__messages">
      <p v-if="messages.length === 0" class="chat-panel__empty">Send a message to talk to the {{ agentNodeName }} agent.</p>
      <div
        v-for="(message, index) in messages"
        :key="index"
        :class="['chat-panel__message', `chat-panel__message--${message.role}`]"
      >
        {{ message.content }}
      </div>
      <div v-if="workflowStore.executing" class="chat-panel__message chat-panel__message--assistant chat-panel__message--pending">
        Thinking…
      </div>
    </div>

    <form class="chat-panel__input" @submit.prevent="onSend">
      <RunnelInput
        :model-value="draft"
        placeholder="Send a message…"
        :disabled="workflowStore.executing"
        @update:model-value="draft = $event"
      />
      <RunnelButton :disabled="!draft.trim() || workflowStore.executing">Send</RunnelButton>
    </form>
  </section>
</template>
