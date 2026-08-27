<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core';
import { computed } from 'vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { INode, NodeConnectionType } from '@n8n-clone/workflow';

const props = defineProps<{ id: string; data: { node: INode; pulse?: boolean; selected?: boolean }; readonly?: boolean }>();
const emit = defineEmits<{ delete: [] }>();

const nodeTypesStore = useNodeTypesStore();
const description = computed(() => nodeTypesStore.byName(props.data.node.type));

interface Port {
  type: NodeConnectionType;
  /** Index within its own type — Merge's two `main` inputs are 0 and 1; a single `ai_languageModel` input is always 0, even though nothing else shares that type on this node. */
  index: number;
}

/** Falls back to a single `main` port only while the node type description hasn't loaded yet — an actually-empty `inputs: []` (every sub-node: Chat Model, Tool) must stay empty, not be forced to 1. */
function indexedPorts(ports: NodeConnectionType[] | undefined): Port[] {
  if (!ports) return [{ type: 'main', index: 0 }];
  const seen: Partial<Record<NodeConnectionType, number>> = {};
  return ports.map((type) => {
    const index = seen[type] ?? 0;
    seen[type] = index + 1;
    return { type, index };
  });
}

const inputPorts = computed(() => indexedPorts(description.value?.inputs));
const outputPorts = computed(() => indexedPorts(description.value?.outputs));

const mainInputs = computed(() => inputPorts.value.filter((p) => p.type === 'main'));
const subInputs = computed(() => inputPorts.value.filter((p) => p.type !== 'main'));
const mainOutputs = computed(() => outputPorts.value.filter((p) => p.type === 'main'));
const subOutputs = computed(() => outputPorts.value.filter((p) => p.type !== 'main'));

function handleId(prefix: 'input' | 'output', port: Port): string {
  return `${prefix}-${port.type}-${port.index}`;
}

function offset(index: number, total: number): string {
  return `${((index + 1) / (total + 1)) * 100}%`;
}

function onDeleteClick(event: MouseEvent): void {
  event.stopPropagation();
  emit('delete');
}
</script>

<template>
  <div class="canvas-node" :class="{ 'canvas-node--pulse': data.pulse, 'canvas-node--selected': data.selected }">
    <button
      v-if="!readonly"
      class="canvas-node__delete nodrag"
      type="button"
      :aria-label="`Delete ${data.node.name}`"
      title="Delete node"
      @click="onDeleteClick"
    >
      ×
    </button>

    <Handle
      v-for="(port, i) in mainInputs"
      :key="handleId('input', port)"
      :id="handleId('input', port)"
      type="target"
      :position="Position.Left"
      :style="{ top: offset(i, mainInputs.length) }"
    />

    <Handle
      v-for="(port, i) in subInputs"
      :key="handleId('input', port)"
      :id="handleId('input', port)"
      type="target"
      :position="Position.Bottom"
      :class="`canvas-node__handle--${port.type}`"
      :style="{ left: offset(i, subInputs.length) }"
    />

    <div class="canvas-node__body">
      <span class="canvas-node__icon">{{ (description?.displayName ?? data.node.type).slice(0, 1) }}</span>
      <span class="canvas-node__name" :title="data.node.name">{{ data.node.name }}</span>
    </div>

    <Handle
      v-for="(port, i) in mainOutputs"
      :key="handleId('output', port)"
      :id="handleId('output', port)"
      type="source"
      :position="Position.Right"
      :style="{ top: offset(i, mainOutputs.length) }"
    />

    <Handle
      v-for="(port, i) in subOutputs"
      :key="handleId('output', port)"
      :id="handleId('output', port)"
      type="source"
      :position="Position.Top"
      :class="`canvas-node__handle--${port.type}`"
      :style="{ left: offset(i, subOutputs.length) }"
    />
  </div>
</template>
