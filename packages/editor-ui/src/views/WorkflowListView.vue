<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { N8nButton } from '@n8n-clone/design-system';
import { workflowsApi } from '../api/workflows.js';
import { useAuthStore } from '../stores/auth.store.js';
import type { IWorkflowRecord } from '../api/types.js';

const router = useRouter();
const authStore = useAuthStore();

const workflows = ref<IWorkflowRecord[]>([]);
const loading = ref(true);

const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const sortBy = ref<'updated' | 'name' | 'created'>('updated');
/** "All Workflows" / "Recent" are real filters over real data (updatedAt); Starred/Trash below
 * them in the sidebar have no backing field on IWorkflowRecord, so those stay disabled rather
 * than pretending to filter something that doesn't exist. */
const libraryView = ref<'all' | 'recent'>('all');
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function refresh(): Promise<void> {
  loading.value = true;
  workflows.value = await workflowsApi.list();
  loading.value = false;
}

const visibleWorkflows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const now = Date.now();
  return workflows.value
    .filter((workflow) => {
      if (libraryView.value === 'recent' && now - new Date(workflow.updatedAt).getTime() > RECENT_WINDOW_MS) return false;
      if (statusFilter.value === 'active' && !workflow.active) return false;
      if (statusFilter.value === 'inactive' && workflow.active) return false;
      if (query && !workflow.name.toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy.value === 'name') return a.name.localeCompare(b.name);
      if (sortBy.value === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
});

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diffMs < minute) return 'just now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < day * 30) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(iso).toLocaleDateString();
}

function openWorkflow(id: string): void {
  void router.push({ name: 'workflow-edit', params: { id } });
}

async function remove(id: string): Promise<void> {
  openMenuId.value = null;
  if (!confirm('Delete this workflow? This cannot be undone.')) return;
  await workflowsApi.remove(id);
  await refresh();
}

async function toggleActive(workflow: IWorkflowRecord): Promise<void> {
  await workflowsApi.update(workflow.id, { active: !workflow.active });
  await refresh();
}

const openMenuId = ref<string | null>(null);
function toggleCardMenu(id: string): void {
  openMenuId.value = openMenuId.value === id ? null : id;
}

const avatarMenuOpen = ref(false);
const avatarMenuRoot = ref<HTMLElement | null>(null);
const userInitial = computed(() => (authStore.user?.email ?? '?').charAt(0).toUpperCase());

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (avatarMenuOpen.value && !avatarMenuRoot.value?.contains(target)) avatarMenuOpen.value = false;
  if (openMenuId.value && !target.closest('.workflow-card__menu-wrap')) openMenuId.value = null;
}

async function logout(): Promise<void> {
  avatarMenuOpen.value = false;
  await authStore.logout();
  await router.push({ name: 'login' });
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  void refresh();
});

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick);
});
</script>

<template>
  <div class="workflow-library">
    <header class="workflow-library__topbar">
      <RouterLink :to="{ name: 'workflows' }" class="workflow-library__logo">
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1">schema</span>
        Runnel
      </RouterLink>

      <div class="workflow-library__topbar-actions">
        <N8nButton @click="router.push({ name: 'workflow-new' })">Create New</N8nButton>
        <button type="button" class="icon-button icon-button--lg" disabled aria-disabled="true" title="Notifications (coming soon)">
          <span class="material-symbols-outlined text-[20px]">notifications</span>
        </button>
        <button type="button" class="icon-button icon-button--lg" disabled aria-disabled="true" title="Settings (coming soon)">
          <span class="material-symbols-outlined text-[20px]">settings</span>
        </button>
        <div ref="avatarMenuRoot" class="app-avatar-wrap">
          <button
            type="button"
            class="app-avatar"
            :aria-expanded="avatarMenuOpen"
            aria-label="Account menu"
            :title="authStore.user?.email"
            @click="avatarMenuOpen = !avatarMenuOpen"
          >
            {{ userInitial }}
          </button>
          <div v-if="avatarMenuOpen" class="app-avatar-menu" role="menu">
            <div v-if="authStore.user" class="app-avatar-email">{{ authStore.user.email }}</div>
            <button type="button" class="app-avatar-menu-item" role="menuitem" @click="logout">
              <span class="material-symbols-outlined text-[16px]">logout</span>
              Log out
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="workflow-library__body">
      <aside class="workflow-library__sidebar">
        <button type="button" class="workflow-library__new-btn" @click="router.push({ name: 'workflow-new' })">
          <span class="material-symbols-outlined text-[18px]">add</span>
          New Workflow
        </button>

        <nav class="workflow-library__nav">
          <p class="workflow-library__nav-label">Library</p>
          <button
            type="button"
            class="workflow-library__nav-item"
            :class="{ 'workflow-library__nav-item--active': libraryView === 'all' }"
            @click="libraryView = 'all'"
          >
            <span class="material-symbols-outlined text-[20px]">folder_open</span> All Workflows
          </button>
          <button
            type="button"
            class="workflow-library__nav-item"
            :class="{ 'workflow-library__nav-item--active': libraryView === 'recent' }"
            @click="libraryView = 'recent'"
          >
            <span class="material-symbols-outlined text-[20px]">schedule</span> Recent
          </button>
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">star</span> Starred
          </button>
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">delete</span> Trash
          </button>
        </nav>

        <nav class="workflow-library__nav">
          <p class="workflow-library__nav-label">Folders</p>
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">api</span> API Integrations
          </button>
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">database</span> Data Pipelines
          </button>
        </nav>

        <div class="workflow-library__sidebar-footer">
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">description</span> Documentation
          </button>
          <button type="button" class="workflow-library__nav-item workflow-library__nav-item--disabled" disabled title="Coming soon">
            <span class="material-symbols-outlined text-[20px]">help</span> Support
          </button>
        </div>
      </aside>

      <main class="workflow-library__main">
        <div class="workflow-library__heading">
          <div>
            <h1>Library</h1>
            <p>Manage and organize your automation workflows.</p>
          </div>
          <div class="workflow-library__tabs">
            <button type="button" class="workflow-library__tab workflow-library__tab--active">My Workflows</button>
            <button type="button" class="workflow-library__tab workflow-library__tab--disabled" disabled title="Coming soon">Templates</button>
            <button type="button" class="workflow-library__tab workflow-library__tab--disabled" disabled title="Coming soon">Community</button>
          </div>
        </div>

        <div class="workflow-library__toolbar">
          <label class="workflow-library__search">
            <span class="material-symbols-outlined text-[18px]">search</span>
            <input v-model="searchQuery" type="text" placeholder="Search workflows by name…" aria-label="Search workflows" />
          </label>

          <div class="workflow-library__toolbar-actions">
            <label class="workflow-library__select">
              <span class="material-symbols-outlined text-[18px]">filter_list</span>
              <select v-model="statusFilter" aria-label="Filter by status">
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label class="workflow-library__select">
              <span class="material-symbols-outlined text-[18px]">sort</span>
              <select v-model="sortBy" aria-label="Sort by">
                <option value="updated">Last updated</option>
                <option value="name">Name</option>
                <option value="created">Date created</option>
              </select>
            </label>
          </div>
        </div>

        <p v-if="loading" class="workflow-library__status-text">Loading…</p>
        <p v-else-if="workflows.length === 0" class="workflow-library__status-text">No workflows yet — create your first one.</p>
        <p v-else-if="visibleWorkflows.length === 0" class="workflow-library__status-text">No workflows match your search and filters.</p>

        <div v-else class="workflow-library__grid">
          <article
            v-for="workflow in visibleWorkflows"
            :key="workflow.id"
            class="workflow-card"
            tabindex="0"
            role="link"
            :aria-label="`Open ${workflow.name}`"
            @click="openWorkflow(workflow.id)"
            @keydown.enter="openWorkflow(workflow.id)"
          >
            <div class="workflow-card__stripe" :class="{ 'workflow-card__stripe--active': workflow.active }" />

            <div class="workflow-card__top">
              <div class="workflow-card__icon" :class="{ 'workflow-card__icon--active': workflow.active }">
                <span class="material-symbols-outlined">account_tree</span>
              </div>
              <div class="workflow-card__title-group">
                <h3 class="workflow-card__title">{{ workflow.name }}</h3>
                <p class="workflow-card__meta">Updated {{ formatRelativeTime(workflow.updatedAt) }}</p>
              </div>
              <div class="workflow-card__menu-wrap">
                <button type="button" class="icon-button" aria-label="Workflow actions" @click.stop="toggleCardMenu(workflow.id)">
                  <span class="material-symbols-outlined text-[18px]">more_vert</span>
                </button>
                <div v-if="openMenuId === workflow.id" class="workflow-card__menu" role="menu" @click.stop>
                  <button type="button" class="workflow-card__menu-item workflow-card__menu-item--danger" role="menuitem" @click="remove(workflow.id)">
                    <span class="material-symbols-outlined text-[16px]">delete</span> Delete
                  </button>
                </div>
              </div>
            </div>

            <p class="workflow-card__nodes">{{ workflow.nodes.length }} node{{ workflow.nodes.length === 1 ? '' : 's' }}</p>

            <div class="workflow-card__footer">
              <span class="workflow-card__tag">{{ workflow.nodes.length === 0 ? 'Empty' : 'Configured' }}</span>
              <button
                type="button"
                class="workflow-card__status"
                :class="{ 'workflow-card__status--active': workflow.active }"
                :title="workflow.active ? 'Click to deactivate' : 'Click to activate'"
                @click.stop="toggleActive(workflow)"
              >
                <span class="workflow-card__status-dot" />
                {{ workflow.active ? 'Active' : 'Inactive' }}
              </button>
            </div>
          </article>
        </div>
      </main>
    </div>
  </div>
</template>
