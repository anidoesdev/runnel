<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { computed } from 'vue';
import CanvasNode from './CanvasNode.vue';
import { useWorkflowStore } from '../../stores/workflow.store.js';
import type { Connection, Edge, EdgeChange, Node as FlowNode, NodeChange, NodeDragEvent } from '@vue-flow/core';
import type { IConnection, NodeConnectionType } from '@n8n-clone/workflow';

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

/**
 * Handle ids encode both the connection type and its per-type index — `output-main-0`,
 * `input-ai_languageModel-0` — since a node can have several *kinds* of port (main, plus any
 * ai_* sub-node ports), not just several main ones. `type` and `index` are always parts[1]/[2]
 * since neither `input`/`output` nor any NodeConnectionType value contains a `-`.
 */
function handlePort(handleId: string | null | undefined): { type: NodeConnectionType; index: number } {
  const parts = (handleId ?? '').split('-');
  return { type: (parts[1] as NodeConnectionType) ?? 'main', index: Number(parts[2] ?? 0) };
}

function portHandleId(prefix: 'input' | 'output', type: NodeConnectionType, index: number): string {
  return `${prefix}-${type}-${index}`;
}

const flowEdges = computed<Edge[]>(() => {
  const edges: Edge[] = [];
  for (const [sourceName, entry] of Object.entries(store.connections)) {
    const sourceId = idByName.value.get(sourceName);
    if (!sourceId) continue;
    for (const [type, branches] of Object.entries(entry) as Array<[NodeConnectionType, IConnection[][]]>) {
      branches.forEach((branch, outputIndex) => {
        for (const connection of branch) {
          const targetId = idByName.value.get(connection.node);
          if (!targetId) continue;
          edges.push({
            id: `${sourceId}:${type}:${outputIndex}->${targetId}:${connection.index}`,
            source: sourceId,
            target: targetId,
            sourceHandle: portHandleId('output', type, outputIndex),
            targetHandle: portHandleId('input', type, connection.index),
            class: type === 'main' ? undefined : `workflow-canvas__edge--sub-node`,
          });
        }
      });
    }
  }
  return edges;
});

function onNodeDragStop({ node }: NodeDragEvent): void {
  store.moveNode(node.id, [node.position.x, node.position.y]);
}

/** A `main` output may only connect to a `main` input, an `ai_languageModel` output only to an `ai_languageModel` input, etc. — dragging a wire between mismatched port kinds is rejected before it's ever created. */
function isValidConnection(connection: Connection): boolean {
  return handlePort(connection.sourceHandle).type === handlePort(connection.targetHandle).type;
}

function onConnect(connection: Connection): void {
  const sourceName = nameById.value.get(connection.source);
  const targetName = nameById.value.get(connection.target);
  if (!sourceName || !targetName) return;
  const source = handlePort(connection.sourceHandle);
  const target = handlePort(connection.targetHandle);
  if (source.type !== target.type) return;
  store.addConnection(sourceName, targetName, source.index, target.index, source.type);
}

function onEdgesChange(changes: EdgeChange[]): void {
  for (const change of changes) {
    if (change.type !== 'remove') continue;
    const edge = flowEdges.value.find((e) => e.id === change.id);
    if (!edge) continue;
    const sourceName = nameById.value.get(edge.source);
    const targetName = nameById.value.get(edge.target);
    if (!sourceName || !targetName) continue;
    const source = handlePort(edge.sourceHandle);
    const target = handlePort(edge.targetHandle);
    store.removeConnection(sourceName, targetName, source.index, target.index, source.type);
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
      :is-valid-connection="isValidConnection"
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
