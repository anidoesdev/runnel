<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { RunnelSelect } from '@runnel/design-system';
import CredentialModal from '../credentials/CredentialModal.vue';
import { useCredentialsStore } from '../../stores/credentials.store.js';
import { useWorkflowStore } from '../../stores/workflow.store.js';

const props = defineProps<{ credentialTypeName: string; nodeId: string }>();

const credentialsStore = useCredentialsStore();
const workflowStore = useWorkflowStore();
const modalOpen = ref(false);

onMounted(() => {
  void credentialsStore.load();
});

const node = computed(() => workflowStore.nodes.find((n) => n.id === props.nodeId));
const available = computed(() => credentialsStore.byType(props.credentialTypeName));
const selectOptions = computed(() => [
  { label: '— Select —', value: '' },
  ...available.value.map((c) => ({ label: c.name, value: c.id })),
]);
const selectedId = computed(() => node.value?.credentials?.[props.credentialTypeName]?.id ?? '');

function onSelect(id: string): void {
  if (!node.value) return;
  const credential = available.value.find((c) => c.id === id) ?? null;
  workflowStore.setNodeCredential(node.value.id, props.credentialTypeName, credential);
}

function onCreated(credential: { id: string; name: string }): void {
  if (!node.value) return;
  workflowStore.setNodeCredential(node.value.id, props.credentialTypeName, credential);
}
</script>

<template>
  <div class="property-field">
    <label>{{ credentialTypeName }}</label>
    <RunnelSelect :model-value="selectedId" :options="selectOptions" @update:model-value="onSelect" />
    <button type="button" class="link-button" @click="modalOpen = true">+ New credential</button>

    <CredentialModal v-model="modalOpen" :credential-type-name="credentialTypeName" @created="onCreated" />
  </div>
</template>
