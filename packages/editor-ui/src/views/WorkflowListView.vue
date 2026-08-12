<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { N8nButton } from '@n8n-clone/design-system';
import { workflowsApi } from '../api/workflows.js';
import { useAuthStore } from '../stores/auth.store.js';
import type { IWorkflowRecord } from '../api/types.js';

const workflows = ref<IWorkflowRecord[]>([]);
const loading = ref(true);

const router = useRouter();
const auth = useAuthStore();

async function refresh(): Promise<void> {
  loading.value = true;
  workflows.value = await workflowsApi.list();
  loading.value = false;
}

async function remove(id: string): Promise<void> {
  if (!confirm('Delete this workflow? This cannot be undone.')) return;
  await workflowsApi.remove(id);
  await refresh();
}

async function logout(): Promise<void> {
  await auth.logout();
  await router.push({ name: 'login' });
}

onMounted(refresh);
</script>

<template>
  <div class="workflow-list">
    <header>
      <h1>Workflows</h1>
      <div>
        <N8nButton @click="router.push({ name: 'workflow-new' })">New workflow</N8nButton>
        <N8nButton variant="secondary" @click="logout">Log out</N8nButton>
      </div>
    </header>

    <p v-if="loading">Loading…</p>
    <p v-else-if="workflows.length === 0">No workflows yet — create your first one.</p>
    <ul v-else class="workflow-list__items">
      <li v-for="workflow in workflows" :key="workflow.id">
        <RouterLink :to="{ name: 'workflow-edit', params: { id: workflow.id } }">{{ workflow.name }}</RouterLink>
        <span :class="['badge', workflow.active ? 'badge--active' : 'badge--inactive']">
          {{ workflow.active ? 'Active' : 'Inactive' }}
        </span>
        <button class="link-button" type="button" @click="remove(workflow.id)">Delete</button>
      </li>
    </ul>
  </div>
</template>
