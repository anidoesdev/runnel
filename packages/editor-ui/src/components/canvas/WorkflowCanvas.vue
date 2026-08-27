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
  selectedNodeId?: string | null;
}>();

const emit = defineEmits<{
  'select-node': [nodeId: string];
  drop: [nodeType: string, position: { x: number; y: number }];
  'ask-assistant': [];
}>();

const store = useWorkflowStore();
const { project, zoomIn, zoomOut, fitView } = useVueFlow();

const deleteKeyCodes = ['Delete', 'Backspace'];

const readonly = computed(() => props.previewNodes !== undefined);
const displayNodes = computed(() => props.previewNodes ?? store.nodes);
const displayConnections = computed(() => props.previewConnections ?? store.connections);
const isEmpty = computed(() => displayNodes.value.length === 0);

const idByName = computed(() => new Map(displayNodes.value.map((n) => [n.name, n.id])));
const nameById = computed(() => new Map(displayNodes.value.map((n) => [n.id, n.name])));

const flowNodes = computed<FlowNode[]>(() =>
  displayNodes.value.map((node) => ({
    id: node.id,
    type: 'custom',
    position: { x: node.position[0], y: node.position[1] },
    data: { node, pulse: (props.pulseNodeNames ?? []).includes(node.name), selected: node.id === props.selectedNodeId },
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
      :delete-key-code="deleteKeyCodes"
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

    <div v-if="isEmpty && !readonly" class="workflow-canvas__empty">
      <span class="material-symbols-outlined workflow-canvas__empty-icon">bolt</span>
      <p class="workflow-canvas__empty-title">Start building</p>
      <p class="workflow-canvas__empty-body">Drag a node in from the sidebar, or describe what you want to automate.</p>
      <button type="button" class="workflow-canvas__empty-cta" @click="emit('ask-assistant')">
        <span class="material-symbols-outlined text-[16px]">smart_toy</span>
        Ask Assistant
      </button>
    </div>

    <div v-if="!readonly" class="workflow-canvas__zoom-controls">
      <button type="button" title="Zoom in" aria-label="Zoom in" @click="zoomIn()">
        <span class="material-symbols-outlined">add</span>
      </button>
      <button type="button" title="Zoom out" aria-label="Zoom out" @click="zoomOut()">
        <span class="material-symbols-outlined">remove</span>
      </button>
      <button type="button" title="Fit view" aria-label="Fit view" @click="fitView()">
        <span class="material-symbols-outlined">fit_screen</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.workflow-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.workflow-canvas__empty {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  max-width: 280px;
  pointer-events: none;
}

.workflow-canvas__empty-icon {
  color: var(--color-outline-variant);
  font-size: 40px;
  margin-bottom: 8px;
}

.workflow-canvas__empty-title {
  font-weight: 600;
  color: var(--color-on-surface);
  margin: 0;
}

.workflow-canvas__empty-body {
  font-size: 13px;
  color: var(--color-on-surface-variant);
  margin: 0 0 12px;
}

.workflow-canvas__empty-cta {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--color-primary);
  color: var(--color-on-primary);
  border: none;
  border-radius: 999px;
  padding: 8px 18px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  transition:
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.1s ease;
}

.workflow-canvas__empty-cta:hover {
  background: var(--color-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.workflow-canvas__empty-cta:active {
  transform: scale(0.97);
}

.workflow-canvas__zoom-controls {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 5;
  display: flex;
  background: var(--color-surface-container-lowest);
  border: 1px solid var(--color-outline-variant);
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.workflow-canvas__zoom-controls button {
  border: none;
  background: none;
  color: var(--color-on-surface-variant);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-right: 1px solid var(--color-outline-variant);
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.workflow-canvas__zoom-controls button:last-child {
  border-right: none;
}

.workflow-canvas__zoom-controls button:hover {
  background: var(--color-surface-container-high);
  color: var(--color-on-surface);
}

.workflow-canvas__zoom-controls button:active {
  background: var(--color-surface-container-highest);
}

.workflow-canvas__zoom-controls .material-symbols-outlined {
  font-size: 18px;
}

/* Neutral, quiet ground instead of a full-bleed saturated tint — the canvas is the dominant
   surface on screen, so it carries no color of its own; nodes and connections supply all the
   color that's needed. */
.workflow-canvas :deep(.vue-flow) {
  background-color: var(--color-surface);
  background-image: radial-gradient(circle, var(--color-outline-variant) 1px, transparent 1px);
  background-size: 24px 24px;
}

.workflow-canvas :deep(.vue-flow__handle) {
  width: 11px;
  height: 11px;
  background: var(--color-surface-container-lowest);
  border: 2px solid var(--color-outline-variant);
  border-radius: 50%;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.workflow-canvas :deep(.vue-flow__handle:hover) {
  border-color: var(--color-primary);
}

.workflow-canvas :deep(.vue-flow__handle.connectionindicator) {
  border-color: var(--color-primary);
}

.workflow-canvas--readonly {
  background: repeating-linear-gradient(45deg, var(--color-bg), var(--color-bg) 12px, var(--color-surface-container) 12px, var(--color-surface-container) 13px);
}
</style>
