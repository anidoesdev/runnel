<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { computed } from 'vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { INode } from '@n8n-clone/workflow';

const props = defineProps<{ id: string; data: { node: INode } }>();
const emit = defineEmits<{ delete: [] }>();

const nodeTypesStore = useNodeTypesStore();
const description = computed(() => nodeTypesStore.byName(props.data.node.type));
const inputCount = computed(() => Math.max(description.value?.inputs.length ?? 1, 1));
const outputCount = computed(() => Math.max(description.value?.outputs.length ?? 1, 1));

function handleOffset(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function onDeleteClick(event: MouseEvent): void {
  event.stopPropagation();
  emit('delete');
}
</script>

<template>
  <div class="canvas-node">
    <button
      class="canvas-node__delete nodrag"
      type="button"
      :aria-label="`Delete ${data.node.name}`"
      title="Delete node"
      @click="onDeleteClick"
    >
      ×
    </button>

    <Handle
      v-for="i in inputCount"
      :key="`in-${i}`"
      :id="`input-${i - 1}`"
      type="target"
      :position="Position.Left"
      :style="{ top: handleOffset(i - 1, inputCount) }"
    />

    <div class="canvas-node__body">
      <span class="canvas-node__icon">{{ (description?.displayName ?? data.node.type).slice(0, 1) }}</span>
      <span class="canvas-node__name">{{ data.node.name }}</span>
    </div>

    <Handle
      v-for="i in outputCount"
      :key="`out-${i}`"
      :id="`output-${i - 1}`"
      type="source"
      :position="Position.Right"
      :style="{ top: handleOffset(i - 1, outputCount) }"
    />
  </div>
</template>
