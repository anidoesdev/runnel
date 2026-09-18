<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { N8nButton } from '@n8n-clone/design-system';
import { foldersApi } from '../api/folders.js';
import { workflowsApi } from '../api/workflows.js';
import { WORKFLOW_TEMPLATES } from '../data/templates.js';
import TopbarActions from '../components/app/TopbarActions.vue';
import type { IFolderRecord, IWorkflowRecord } from '../api/types.js';
import type { IWorkflowTemplate } from '../data/templates.js';

const router = useRouter();

const workflows = ref<IWorkflowRecord[]>([]);
const folders = ref<IFolderRecord[]>([]);
const loading = ref(true);

const searchQuery = ref('');
const statusFilter = ref<'all' | 'active' | 'inactive'>('all');
const sortBy = ref<'updated' | 'name' | 'created'>('updated');

/**
 * "All Workflows" and "Recent" filter the live list client-side; "Starred" and "Trash" are
 * server-side views, because starring is a stored flag and trashed workflows are deliberately
 * excluded from every other query (see the workflows controller). Selecting a folder is a
 * third server-side filter that composes with none of them — picking one clears the view.
 */
type LibraryView = 'all' | 'recent' | 'starred' | 'trash';
const libraryView = ref<LibraryView>('all');
const selectedFolderId = ref<string | null>(null);
const activeTab = ref<'workflows' | 'templates'>('workflows');
const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const REPO_URL = 'https://github.com/anidoesdev/runnel';
const DOCS_URL = `${REPO_URL}#readme`;
const SUPPORT_URL = `${REPO_URL}/issues`;
const COMMUNITY_URL = `${REPO_URL}/discussions`;

const isTrash = computed(() => libraryView.value === 'trash');

async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const view = libraryView.value === 'starred' || libraryView.value === 'trash' ? libraryView.value : 'all';
    workflows.value = await workflowsApi.list({
      view,
      ...(selectedFolderId.value ? { folderId: selectedFolderId.value } : {}),
    });
  } finally {
    loading.value = false;
  }
}

async function refreshFolders(): Promise<void> {
  folders.value = await foldersApi.list();
}

watch([libraryView, selectedFolderId], () => void refresh());

function selectView(view: LibraryView): void {
  selectedFolderId.value = null;
  libraryView.value = view;
  activeTab.value = 'workflows';
}

function selectFolder(id: string): void {
  libraryView.value = 'all';
  selectedFolderId.value = id;
  activeTab.value = 'workflows';
}

const workflowCountByFolder = computed(() => {
  const counts: Record<string, number> = {};
  for (const workflow of workflows.value) {
    if (workflow.folderId) counts[workflow.folderId] = (counts[workflow.folderId] ?? 0) + 1;
  }
  return counts;
});

const heading = computed(() => {
  if (selectedFolderId.value) return folders.value.find((folder) => folder.id === selectedFolderId.value)?.name ?? 'Folder';
  if (libraryView.value === 'starred') return 'Starred';
  if (libraryView.value === 'trash') return 'Trash';
  if (libraryView.value === 'recent') return 'Recent';
  return 'Library';
});

const subheading = computed(() => {
  if (libraryView.value === 'trash') return 'Deleted workflows are kept for 30 days, then removed for good.';
  if (libraryView.value === 'starred') return 'The workflows you starred.';
  return 'Manage and organize your automation workflows.';
});

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

/** Days left before the 30-day purge takes a trashed workflow for good. */
function daysLeftInTrash(deletedAt: string | null): number {
  if (!deletedAt) return 30;
  const elapsedDays = (Date.now() - new Date(deletedAt).getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(30 - elapsedDays));
}

function openWorkflow(id: string): void {
  if (isTrash.value) return;
  void router.push({ name: 'workflow-edit', params: { id } });
}

async function remove(id: string): Promise<void> {
  openMenuId.value = null;
  await workflowsApi.remove(id);
  await refresh();
}

async function restore(id: string): Promise<void> {
  await workflowsApi.restore(id);
  await refresh();
}

async function removePermanently(id: string): Promise<void> {
  if (!confirm('Delete this workflow permanently? This cannot be undone.')) return;
  await workflowsApi.removePermanently(id);
  await refresh();
}

async function toggleActive(workflow: IWorkflowRecord): Promise<void> {
  await workflowsApi.update(workflow.id, { active: !workflow.active });
  await refresh();
}

async function toggleStar(workflow: IWorkflowRecord): Promise<void> {
  openMenuId.value = null;
  await workflowsApi.update(workflow.id, { starred: !workflow.starred });
  await refresh();
}

async function moveToFolder(workflow: IWorkflowRecord, folderId: string | null): Promise<void> {
  openMenuId.value = null;
  await workflowsApi.update(workflow.id, { folderId });
  await refresh();
}

async function createFolder(): Promise<void> {
  const name = prompt('Folder name')?.trim();
  if (!name) return;
  await foldersApi.create(name);
  await refreshFolders();
}

async function renameFolder(folder: IFolderRecord): Promise<void> {
  const name = prompt('Rename folder', folder.name)?.trim();
  if (!name || name === folder.name) return;
  await foldersApi.rename(folder.id, name);
  await refreshFolders();
}

async function deleteFolder(folder: IFolderRecord): Promise<void> {
  if (!confirm(`Delete the folder "${folder.name}"? Its workflows are kept and become unfiled.`)) return;
  await foldersApi.remove(folder.id);
  if (selectedFolderId.value === folder.id) selectedFolderId.value = null;
  await refreshFolders();
  await refresh();
}

/** A template opens as a real, saved workflow so the canvas has something to autosave into. */
async function useTemplate(template: IWorkflowTemplate): Promise<void> {
  const { nodes, connections } = template.build();
  const created = await workflowsApi.create({
    name: template.name,
    nodes,
    connections,
    ...(selectedFolderId.value ? { folderId: selectedFolderId.value } : {}),
  });
  await router.push({ name: 'workflow-edit', params: { id: created.id } });
}

const openMenuId = ref<string | null>(null);
function toggleCardMenu(id: string): void {
  openMenuId.value = openMenuId.value === id ? null : id;
}

function onDocumentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  if (openMenuId.value && !target.closest('.workflow-card__menu-wrap')) openMenuId.value = null;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  void refresh();
  void refreshFolders();
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
        <TopbarActions />
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
            :class="{ 'workflow-library__nav-item--active': libraryView === 'all' && !selectedFolderId }"
            @click="selectView('all')"
          >
            <span class="material-symbols-outlined text-[20px]">folder_open</span> All Workflows
          </button>
          <button
            type="button"
            class="workflow-library__nav-item"
            :class="{ 'workflow-library__nav-item--active': libraryView === 'recent' }"
            @click="selectView('recent')"
          >
            <span class="material-symbols-outlined text-[20px]">schedule</span> Recent
          </button>
          <button
            type="button"
            class="workflow-library__nav-item"
            :class="{ 'workflow-library__nav-item--active': libraryView === 'starred' }"
            @click="selectView('starred')"
          >
            <span class="material-symbols-outlined text-[20px]">star</span> Starred
          </button>
          <button
            type="button"
            class="workflow-library__nav-item"
            :class="{ 'workflow-library__nav-item--active': libraryView === 'trash' }"
            @click="selectView('trash')"
          >
            <span class="material-symbols-outlined text-[20px]">delete</span> Trash
          </button>
        </nav>

        <nav class="workflow-library__nav">
          <p class="workflow-library__nav-label">
            Folders
            <button type="button" class="workflow-library__nav-add" title="New folder" aria-label="New folder" @click="createFolder">
              <span class="material-symbols-outlined text-[16px]">add</span>
            </button>
          </p>
          <p v-if="!folders.length" class="workflow-library__nav-empty">No folders yet.</p>
          <div v-for="folder in folders" :key="folder.id" class="workflow-library__folder-row">
            <button
              type="button"
              class="workflow-library__nav-item workflow-library__nav-item--folder"
              :class="{ 'workflow-library__nav-item--active': selectedFolderId === folder.id }"
              @click="selectFolder(folder.id)"
            >
              <span class="material-symbols-outlined text-[20px]">folder</span>
              <span class="workflow-library__folder-name">{{ folder.name }}</span>
              <span v-if="workflowCountByFolder[folder.id]" class="workflow-library__folder-count">{{ workflowCountByFolder[folder.id] }}</span>
            </button>
            <button type="button" class="icon-button" title="Rename folder" aria-label="Rename folder" @click="renameFolder(folder)">
              <span class="material-symbols-outlined text-[16px]">edit</span>
            </button>
            <button type="button" class="icon-button" title="Delete folder" aria-label="Delete folder" @click="deleteFolder(folder)">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </nav>

        <div class="workflow-library__sidebar-footer">
          <a class="workflow-library__nav-item" :href="DOCS_URL" target="_blank" rel="noreferrer noopener">
            <span class="material-symbols-outlined text-[20px]">description</span> Documentation
          </a>
          <a class="workflow-library__nav-item" :href="SUPPORT_URL" target="_blank" rel="noreferrer noopener">
            <span class="material-symbols-outlined text-[20px]">help</span> Support
          </a>
        </div>
      </aside>

      <main class="workflow-library__main">
        <div class="workflow-library__heading">
          <div>
            <h1>{{ activeTab === 'templates' ? 'Templates' : heading }}</h1>
            <p>{{ activeTab === 'templates' ? 'Start from a working shape and fill in the details.' : subheading }}</p>
          </div>
          <div class="workflow-library__tabs">
            <button
              type="button"
              class="workflow-library__tab"
              :class="{ 'workflow-library__tab--active': activeTab === 'workflows' }"
              @click="activeTab = 'workflows'"
            >
              My Workflows
            </button>
            <button
              type="button"
              class="workflow-library__tab"
              :class="{ 'workflow-library__tab--active': activeTab === 'templates' }"
              @click="activeTab = 'templates'"
            >
              Templates
            </button>
            <a class="workflow-library__tab" :href="COMMUNITY_URL" target="_blank" rel="noreferrer noopener" title="Opens GitHub Discussions">
              Community
              <span class="material-symbols-outlined text-[14px]">open_in_new</span>
            </a>
          </div>
        </div>

        <template v-if="activeTab === 'templates'">
          <div class="workflow-library__grid">
            <article v-for="template in WORKFLOW_TEMPLATES" :key="template.id" class="workflow-card template-card">
              <div class="workflow-card__top">
                <div class="workflow-card__icon">
                  <span class="material-symbols-outlined">{{ template.icon }}</span>
                </div>
                <div class="workflow-card__title-group">
                  <h3 class="workflow-card__title">{{ template.name }}</h3>
                  <p class="workflow-card__meta">{{ template.steps.length }} nodes</p>
                </div>
              </div>

              <p class="template-card__description">{{ template.description }}</p>

              <div class="template-card__steps">
                <span v-for="(step, index) in template.steps" :key="step" class="template-card__step">
                  {{ step }}<span v-if="index < template.steps.length - 1" class="template-card__arrow">→</span>
                </span>
              </div>

              <div class="workflow-card__footer">
                <N8nButton @click="useTemplate(template)">Use template</N8nButton>
              </div>
            </article>
          </div>
        </template>

        <template v-else>
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
          <p v-else-if="workflows.length === 0 && isTrash" class="workflow-library__status-text">The trash is empty.</p>
          <p v-else-if="workflows.length === 0 && libraryView === 'starred'" class="workflow-library__status-text">
            Nothing starred yet — star a workflow to find it quickly here.
          </p>
          <p v-else-if="workflows.length === 0" class="workflow-library__status-text">No workflows yet — create your first one.</p>
          <p v-else-if="visibleWorkflows.length === 0" class="workflow-library__status-text">No workflows match your search and filters.</p>

          <div v-else class="workflow-library__grid">
            <article
              v-for="workflow in visibleWorkflows"
              :key="workflow.id"
              class="workflow-card"
              :class="{ 'workflow-card--trashed': isTrash }"
              :tabindex="isTrash ? undefined : 0"
              :role="isTrash ? undefined : 'link'"
              :aria-label="isTrash ? undefined : `Open ${workflow.name}`"
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
                  <p class="workflow-card__meta">
                    <template v-if="isTrash">Deleted {{ formatRelativeTime(workflow.deletedAt ?? workflow.updatedAt) }}</template>
                    <template v-else>Updated {{ formatRelativeTime(workflow.updatedAt) }}</template>
                  </p>
                </div>

                <button
                  v-if="!isTrash"
                  type="button"
                  class="icon-button workflow-card__star"
                  :class="{ 'workflow-card__star--on': workflow.starred }"
                  :title="workflow.starred ? 'Unstar' : 'Star'"
                  :aria-label="workflow.starred ? `Unstar ${workflow.name}` : `Star ${workflow.name}`"
                  :aria-pressed="workflow.starred"
                  @click.stop="toggleStar(workflow)"
                >
                  <span class="material-symbols-outlined text-[18px]" :style="workflow.starred ? { fontVariationSettings: `'FILL' 1` } : undefined">star</span>
                </button>

                <div v-if="!isTrash" class="workflow-card__menu-wrap">
                  <button type="button" class="icon-button" aria-label="Workflow actions" @click.stop="toggleCardMenu(workflow.id)">
                    <span class="material-symbols-outlined text-[18px]">more_vert</span>
                  </button>
                  <div v-if="openMenuId === workflow.id" class="workflow-card__menu" role="menu" @click.stop>
                    <button type="button" class="workflow-card__menu-item" role="menuitem" @click="toggleStar(workflow)">
                      <span class="material-symbols-outlined text-[16px]">star</span>
                      {{ workflow.starred ? 'Remove star' : 'Star' }}
                    </button>

                    <p class="workflow-card__menu-label">Move to</p>
                    <button
                      v-if="workflow.folderId"
                      type="button"
                      class="workflow-card__menu-item"
                      role="menuitem"
                      @click="moveToFolder(workflow, null)"
                    >
                      <span class="material-symbols-outlined text-[16px]">folder_off</span> No folder
                    </button>
                    <button
                      v-for="folder in folders.filter((candidate) => candidate.id !== workflow.folderId)"
                      :key="folder.id"
                      type="button"
                      class="workflow-card__menu-item"
                      role="menuitem"
                      @click="moveToFolder(workflow, folder.id)"
                    >
                      <span class="material-symbols-outlined text-[16px]">folder</span> {{ folder.name }}
                    </button>
                    <p v-if="!folders.length" class="workflow-card__menu-empty">No folders yet</p>

                    <button type="button" class="workflow-card__menu-item workflow-card__menu-item--danger" role="menuitem" @click="remove(workflow.id)">
                      <span class="material-symbols-outlined text-[16px]">delete</span> Move to trash
                    </button>
                  </div>
                </div>
              </div>

              <p class="workflow-card__nodes">{{ workflow.nodes.length }} node{{ workflow.nodes.length === 1 ? '' : 's' }}</p>

              <div v-if="isTrash" class="workflow-card__footer">
                <span class="workflow-card__tag">{{ daysLeftInTrash(workflow.deletedAt) }} days left</span>
                <div class="workflow-card__trash-actions">
                  <button type="button" class="workflow-card__trash-action" @click.stop="restore(workflow.id)">
                    <span class="material-symbols-outlined text-[16px]">restore_from_trash</span> Restore
                  </button>
                  <button
                    type="button"
                    class="workflow-card__trash-action workflow-card__trash-action--danger"
                    @click.stop="removePermanently(workflow.id)"
                  >
                    <span class="material-symbols-outlined text-[16px]">delete_forever</span> Delete forever
                  </button>
                </div>
              </div>

              <div v-else class="workflow-card__footer">
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
        </template>
      </main>
    </div>
  </div>
</template>
