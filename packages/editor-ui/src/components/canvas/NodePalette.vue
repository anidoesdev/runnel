<script setup lang="ts">
import { computed } from 'vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

const store = useNodeTypesStore();

const groups = computed<Array<[string, INodeTypeDescription[]]>>(() => {
  const map = new Map<string, INodeTypeDescription[]>();
  for (const nodeType of store.nodeTypes) {
    const group = nodeType.group[0] ?? 'other';
    const list = map.get(group) ?? [];
    list.push(nodeType);
    map.set(group, list);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
});

function onDragStart(event: DragEvent, nodeTypeName: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData('application/n8n-node-type', nodeTypeName);
  event.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <aside class="node-palette">
    <h2>Nodes</h2>
    <div v-for="[group, types] in groups" :key="group" class="node-palette__group">
      <h3>{{ group }}</h3>
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
  </aside>
</template>
