<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { computed } from 'vue';
import CanvasNode from './CanvasNode.vue';
import { useWorkflowStore } from '../../stores/workflow.store.js';
import type { Connection, Edge, EdgeChange, Node as FlowNode, NodeChange, NodeDragEvent } from '@vue-flow/core';

const emit = defineEmits<{
  'select-node': [nodeId: string];
  drop: [nodeType: string, position: { x: number; y: number }];
}>();

const store = useWorkflowStore();
const { project } = useVueFlow();

const idByName = computed(() => new Map(store.nodes.map((n) => [n.name, n.id])));
const nameById = computed(() => new Map(store.nodes.map((n) => [n.id, n.name])));

const flowNodes = computed<FlowNode[]>(() =>
  store.nodes.map((node) => ({
    id: node.id,
    type: 'custom',
    position: { x: node.position[0], y: node.position[1] },
    data: { node },
  })),
);

const flowEdges = computed<Edge[]>(() => {
  const edges: Edge[] = [];
  for (const [sourceName, entry] of Object.entries(store.connections)) {
    const sourceId = idByName.value.get(sourceName);
    if (!sourceId) continue;
    entry.main.forEach((branch, outputIndex) => {
      for (const connection of branch) {
        const targetId = idByName.value.get(connection.node);
        if (!targetId) continue;
        edges.push({
          id: `${sourceId}:${outputIndex}->${targetId}:${connection.index}`,
          source: sourceId,
          target: targetId,
          sourceHandle: `output-${outputIndex}`,
          targetHandle: `input-${connection.index}`,
        });
      }
    });
  }
  return edges;
});

function handleIndex(handleId: string | null | undefined): number {
  return Number(handleId?.split('-')[1] ?? 0);
}

function onNodeDragStop({ node }: NodeDragEvent): void {
  store.moveNode(node.id, [node.position.x, node.position.y]);
}

function onConnect(connection: Connection): void {
  const sourceName = nameById.value.get(connection.source);
  const targetName = nameById.value.get(connection.target);
  if (!sourceName || !targetName) return;
  store.addConnection(sourceName, targetName, handleIndex(connection.sourceHandle), handleIndex(connection.targetHandle));
}

function onEdgesChange(changes: EdgeChange[]): void {
  for (const change of changes) {
    if (change.type !== 'remove') continue;
    const edge = flowEdges.value.find((e) => e.id === change.id);
    if (!edge) continue;
    const sourceName = nameById.value.get(edge.source);
    const targetName = nameById.value.get(edge.target);
    if (!sourceName || !targetName) continue;
    store.removeConnection(sourceName, targetName, handleIndex(edge.sourceHandle), handleIndex(edge.targetHandle));
  }
}

function onNodesChange(changes: NodeChange[]): void {
  for (const change of changes) {
    if (change.type === 'remove') store.removeNode(change.id);
  }
}

function onNodeClick({ node }: { node: FlowNode }): void {
  emit('select-node', node.id);
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  const nodeType = event.dataTransfer?.getData('application/n8n-node-type');
  if (!nodeType) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const position = project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  emit('drop', nodeType, position);
}
</script>

<template>
  <div class="workflow-canvas" @dragover="onDragOver" @drop="onDrop">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-connectable="true"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
      @edges-change="onEdgesChange"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
    >
      <template #node-custom="nodeProps">
        <CanvasNode v-bind="nodeProps" @delete="store.removeNode(nodeProps.id)" />
      </template>
    </VueFlow>
  </div>
</template>

<style scoped>
.workflow-canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
