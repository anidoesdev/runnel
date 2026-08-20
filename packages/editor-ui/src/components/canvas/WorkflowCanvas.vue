<script setup lang="ts">
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { computed } from 'vue';
import CanvasNode from './CanvasNode.vue';
import { useWorkflowStore } from '../../stores/workflow.store.js';
import type { Connection, Edge, EdgeChange, Node as FlowNode, NodeChange, NodeDragEvent } from '@vue-flow/core';
import type { IConnection, IConnections, INode, NodeConnectionType } from '@n8n-clone/workflow';

const props = defineProps<{
  /** When given, the canvas renders this instead of the live workflow store — a read-only preview of the assistant's in-progress draft (Part 6: "highlight on the canvas in real time"). Drag/connect/delete are no-ops while previewing; edit via chat, not the canvas, until the draft is applied. */
  previewNodes?: INode[];
  previewConnections?: IConnections;
  pulseNodeNames?: string[];
  pulseConnectionKeys?: string[];
}>();

const emit = defineEmits<{
  'select-node': [nodeId: string];
  drop: [nodeType: string, position: { x: number; y: number }];
}>();

const store = useWorkflowStore();
const { project } = useVueFlow();

const readonly = computed(() => props.previewNodes !== undefined);
const displayNodes = computed(() => props.previewNodes ?? store.nodes);
const displayConnections = computed(() => props.previewConnections ?? store.connections);

const idByName = computed(() => new Map(displayNodes.value.map((n) => [n.name, n.id])));
const nameById = computed(() => new Map(displayNodes.value.map((n) => [n.id, n.name])));

const flowNodes = computed<FlowNode[]>(() =>
  displayNodes.value.map((node) => ({
    id: node.id,
    type: 'custom',
    position: { x: node.position[0], y: node.position[1] },
    data: { node, pulse: (props.pulseNodeNames ?? []).includes(node.name) },
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
  const pulseKeys = new Set(props.pulseConnectionKeys ?? []);
  const edges: Edge[] = [];
  for (const [sourceName, entry] of Object.entries(displayConnections.value)) {
    const sourceId = idByName.value.get(sourceName);
    if (!sourceId) continue;
    for (const [type, branches] of Object.entries(entry) as Array<[NodeConnectionType, IConnection[][]]>) {
      branches.forEach((branch, outputIndex) => {
        for (const connection of branch) {
          const targetId = idByName.value.get(connection.node);
          if (!targetId) continue;
          const classes = [type === 'main' ? undefined : 'workflow-canvas__edge--sub-node'];
          if (pulseKeys.has(`${sourceName}->${connection.node}`)) classes.push('workflow-canvas__edge--pulse');
          edges.push({
            id: `${sourceId}:${type}:${outputIndex}->${targetId}:${connection.index}`,
            source: sourceId,
            target: targetId,
            sourceHandle: portHandleId('output', type, outputIndex),
            targetHandle: portHandleId('input', type, connection.index),
            class: classes.filter(Boolean).join(' ') || undefined,
          });
        }
      });
    }
  }
  return edges;
});

function onNodeDragStop({ node }: NodeDragEvent): void {
  if (readonly.value) return;
  store.moveNode(node.id, [node.position.x, node.position.y]);
}

/**
 * A `main` output may only connect to a `main` input, an `ai_languageModel` output only to an
 * `ai_languageModel` input, etc. — dragging a wire between mismatched port kinds is rejected
 * before it's ever created. Deliberately NOT gated on `readonly`: Vue Flow calls this same
 * callback to validate every *existing* edge it renders from the `:edges` prop, not just a
 * new user-drawn one — returning false here whenever readonly is true silently drops every
 * already-valid connection instead of just blocking new ones. `:nodes-connectable="!readonly"`
 * is what actually stops the user from starting a new drag in preview mode.
 */
function isValidConnection(connection: Connection): boolean {
  return handlePort(connection.sourceHandle).type === handlePort(connection.targetHandle).type;
}

function onConnect(connection: Connection): void {
  if (readonly.value) return;
  const sourceName = nameById.value.get(connection.source);
  const targetName = nameById.value.get(connection.target);
  if (!sourceName || !targetName) return;
  const source = handlePort(connection.sourceHandle);
  const target = handlePort(connection.targetHandle);
  if (source.type !== target.type) return;
  store.addConnection(sourceName, targetName, source.index, target.index, source.type);
}

function onEdgesChange(changes: EdgeChange[]): void {
  if (readonly.value) return;
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
  if (readonly.value) return;
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
  if (readonly.value) return;
  const nodeType = event.dataTransfer?.getData('application/n8n-node-type');
  if (!nodeType) return;
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const position = project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  emit('drop', nodeType, position);
}

function onDeleteNode(nodeId: string): void {
  if (readonly.value) return;
  store.removeNode(nodeId);
}
</script>

<template>
  <div class="workflow-canvas" :class="{ 'workflow-canvas--readonly': readonly }" @dragover="onDragOver" @drop="onDrop">
    <VueFlow
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-connectable="!readonly"
      :nodes-draggable="!readonly"
      :is-valid-connection="isValidConnection"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
      @edges-change="onEdgesChange"
      @nodes-change="onNodesChange"
      @node-click="onNodeClick"
    >
      <template #node-custom="nodeProps">
        <CanvasNode v-bind="nodeProps" :readonly="readonly" @delete="onDeleteNode(nodeProps.id)" />
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

.workflow-canvas--readonly {
  background: repeating-linear-gradient(45deg, var(--color-bg), var(--color-bg) 12px, #eee 12px, #eee 13px);
}
</style>
