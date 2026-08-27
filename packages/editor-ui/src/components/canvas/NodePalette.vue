<script setup lang="ts">
import { computed, ref } from 'vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

const store = useNodeTypesStore();

const filter = ref('');
const activeGroup = ref<string | null>(null);

/** Real, distinct `group[0]` values actually present in the registry — not a fixed hardcoded list, so a category button never dead-ends on zero nodes. */
const availableGroups = computed(() => {
  const seen = new Set<string>();
  for (const nodeType of store.nodeTypes) seen.add(nodeType.group[0] ?? 'other');
  return [...seen].sort();
});

const groupIcons: Record<string, string> = { trigger: 'bolt', transform: 'transform', ai: 'smart_toy' };
const groupLabels: Record<string, string> = { trigger: 'Triggers', transform: 'Transform', ai: 'AI' };

function iconFor(group: string): string {
  return groupIcons[group] ?? 'construction';
}

function labelFor(group: string): string {
  return groupLabels[group] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

const filteredTypes = computed<INodeTypeDescription[]>(() => {
  const query = filter.value.trim().toLowerCase();
  return store.nodeTypes.filter((nodeType) => {
    if (activeGroup.value && (nodeType.group[0] ?? 'other') !== activeGroup.value) return false;
    if (!query) return true;
    return nodeType.displayName.toLowerCase().includes(query) || nodeType.description.toLowerCase().includes(query);
  });
});

const groups = computed<Array<[string, INodeTypeDescription[]]>>(() => {
  const map = new Map<string, INodeTypeDescription[]>();
  for (const nodeType of filteredTypes.value) {
    const group = nodeType.group[0] ?? 'other';
    const list = map.get(group) ?? [];
    list.push(nodeType);
    map.set(group, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
});

function toggleGroup(group: string): void {
  activeGroup.value = activeGroup.value === group ? null : group;
}

function onDragStart(event: DragEvent, nodeTypeName: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('application/n8n-node-type', nodeTypeName);
  event.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <aside class="node-palette flex flex-col">
    <div class="relative px-1 mb-2">
      <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[16px]">search</span>
      <input
        v-model="filter"
        type="text"
        placeholder="Search nodes…"
        class="pl-8 pr-3 py-1.5 w-full bg-surface-container-lowest border border-surface-variant rounded-lg text-body-sm focus:border-primary-container focus:ring-1 focus:ring-primary-container outline-none"
      />
    </div>

    <nav class="flex flex-wrap items-center gap-1.5 px-1 mb-3">
      <button
        v-for="group in availableGroups"
        :key="group"
        type="button"
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-label-sm transition-colors duration-150"
        :class="
          activeGroup === group
            ? 'bg-secondary-container text-on-secondary-container font-medium'
            : 'text-on-surface-variant hover:bg-surface-container-high'
        "
        @click="toggleGroup(group)"
      >
        <span class="material-symbols-outlined text-[15px]">{{ iconFor(group) }}</span>
        {{ labelFor(group) }}
      </button>
    </nav>

    <div class="flex-1 overflow-y-auto px-1">
      <div v-for="[group, types] in groups" :key="group" class="node-palette__group">
        <h3>{{ labelFor(group) }}</h3>
        <div
          v-for="nodeType in types"
          :key="nodeType.name"
          class="node-palette__item"
          draggable="true"
          :title="nodeType.description"
          @dragstart="onDragStart($event, nodeType.name)"
        >
          {{ nodeType.displayName }}
        </div>
      </div>

      <p v-if="groups.length === 0" class="font-body-sm text-body-sm text-on-surface-variant px-2 py-4">No components match.</p>
    </div>
  </aside>
</template>
