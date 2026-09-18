<script setup lang="ts">
import { computed } from 'vue';
import { flowTiming, layoutFlow, onWindow } from '../../utils/flowLayout.js';
import { nodeIcon, nodeTypeLabel } from '../../utils/nodeIcons.js';
import type { IConnections, INode } from '@runnel/workflow';
import type { IFlowMetrics } from '../../utils/flowLayout.js';

/**
 * A workflow drawn as a live flow: nodes light up in execution order and data pulses travel along
 * the connections, looping like a run you're watching. Used for the landing page hero and the
 * library cards; the real editor canvas animates actual runs instead (see WorkflowCanvas.vue).
 *
 * Pure SVG + SMIL: every animation shares one cycle length and starts together, so the loop stays
 * in sync with no script or timers. It never animates for someone who asked their OS to reduce motion.
 */
const props = withDefaults(
  defineProps<{
    nodes: Array<Pick<INode, 'name' | 'type' | 'position'>>;
    connections: IConnections;
    variant?: 'card' | 'hero';
    animate?: boolean;
  }>(),
  { variant: 'card', animate: true },
);

const METRICS: Record<'card' | 'hero', IFlowMetrics> = {
  // Tight gaps relative to node size, so a thumbnail spends its pixels on nodes, not empty space.
  card: { nodeWidth: 64, nodeHeight: 64, gapX: 100, gapY: 80 },
  hero: { nodeWidth: 232, nodeHeight: 64, gapX: 300, gapY: 100 },
};

/** Filter ids are document-global, so each preview needs its own. */
const uid = `flow-${Math.random().toString(36).slice(2, 10)}`;

const prefersReducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const playing = computed(() => props.animate && !prefersReducedMotion);

const metrics = computed(() => METRICS[props.variant]);
const layout = computed(() => layoutFlow(props.nodes, props.connections, metrics.value));
const timing = computed(() => flowTiming(layout.value.steps));
const dur = computed(() => `${timing.value.cycle.toFixed(2)}s`);
const viewBox = computed(() => {
  const { x, y, width, height } = layout.value.viewBox;
  return `${x} ${y} ${width} ${height}`;
});

function nodeGlow(step: number) {
  const { start, end } = timing.value.nodeWindow(step);
  return onWindow(start, end);
}

function edgeLit(step: number) {
  const { start, end } = timing.value.edgeWindow(step);
  return onWindow(start, end);
}

/** The pulse sits at the edge's start until its window, runs the length of it, then waits at the end. */
function edgeMotion(step: number) {
  const { start, end } = timing.value.edgeWindow(step);
  return { keyPoints: '0;0;1;1', keyTimes: `0;${start.toFixed(4)};${end.toFixed(4)};1` };
}

/** The done tick appears when a node finishes and stays until the loop rests and restarts. */
function doneTick(step: number) {
  const finished = timing.value.nodeWindow(step).end;
  return { values: '0;0;1;1;0', keyTimes: `0;${finished.toFixed(4)};${Math.min(0.97, finished + 0.03).toFixed(4)};0.97;1` };
}

const label = computed(() => `Workflow preview with ${props.nodes.length} node${props.nodes.length === 1 ? '' : 's'}`);
</script>

<template>
  <svg
    v-if="layout.nodes.length"
    class="flow-preview"
    :class="[`flow-preview--${variant}`, { 'flow-preview--playing': playing }]"
    :viewBox="viewBox"
    preserveAspectRatio="xMidYMid meet"
    role="img"
    :aria-label="label"
  >
    <defs>
      <filter :id="`${uid}-glow`" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="3.5" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <g class="flow-preview__edges">
      <template v-for="edge in layout.edges" :key="edge.id">
        <path :d="edge.path" class="flow-preview__edge" :class="{ 'flow-preview__edge--ai': edge.kind === 'ai' }" />
        <template v-if="playing">
          <path :d="edge.path" class="flow-preview__edge-lit" :class="{ 'flow-preview__edge-lit--ai': edge.kind === 'ai' }" opacity="0">
            <animate attributeName="opacity" :dur="dur" repeatCount="indefinite" v-bind="edgeLit(edge.step)" />
          </path>
          <circle class="flow-preview__pulse" :class="{ 'flow-preview__pulse--ai': edge.kind === 'ai' }" :r="variant === 'hero' ? 5 : 4.5" :filter="`url(#${uid}-glow)`" opacity="0">
            <animateMotion :dur="dur" repeatCount="indefinite" calcMode="linear" :path="edge.path" v-bind="edgeMotion(edge.step)" />
            <animate attributeName="opacity" :dur="dur" repeatCount="indefinite" v-bind="edgeLit(edge.step)" />
          </circle>
        </template>
      </template>
    </g>

    <g v-for="node in layout.nodes" :key="node.name" :transform="`translate(${node.x} ${node.y})`" class="flow-preview__node-group">
      <rect
        v-if="playing"
        class="flow-preview__node-glow"
        :width="metrics.nodeWidth"
        :height="metrics.nodeHeight"
        :rx="variant === 'hero' ? 14 : 16"
        :filter="`url(#${uid}-glow)`"
        opacity="0"
      >
        <animate attributeName="opacity" :dur="dur" repeatCount="indefinite" v-bind="nodeGlow(node.step)" />
      </rect>
      <rect
        class="flow-preview__node"
        :class="{ 'flow-preview__node--sub': node.isSubNode }"
        :width="metrics.nodeWidth"
        :height="metrics.nodeHeight"
        :rx="variant === 'hero' ? 14 : 16"
      />
      <foreignObject :width="metrics.nodeWidth" :height="metrics.nodeHeight">
        <div class="flow-preview__content">
          <span class="flow-preview__icon material-symbols-outlined">{{ nodeIcon(node.type) }}</span>
          <span v-if="variant === 'hero'" class="flow-preview__text">
            <span class="flow-preview__name">{{ node.name }}</span>
            <span class="flow-preview__type">{{ nodeTypeLabel(node.type) }}</span>
          </span>
        </div>
      </foreignObject>
      <g v-if="playing" class="flow-preview__done" :transform="`translate(${metrics.nodeWidth - 4} 4)`" opacity="0">
        <circle r="7" />
        <path d="M -3 0 L -1 2.2 L 3.2 -2.2" />
        <animate attributeName="opacity" :dur="dur" repeatCount="indefinite" v-bind="doneTick(node.step)" />
      </g>
    </g>
  </svg>
  <div v-else class="flow-preview flow-preview--empty">
    <span class="material-symbols-outlined">add_circle</span>
    <span>Empty workflow</span>
  </div>
</template>

<style scoped>
.flow-preview {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.flow-preview__edge {
  fill: none;
  stroke: var(--color-flow-edge);
  stroke-width: 2;
}

.flow-preview__edge--ai {
  stroke: color-mix(in srgb, var(--color-ai) 45%, transparent);
  stroke-dasharray: 5 4;
}

.flow-preview__edge-lit {
  fill: none;
  stroke: var(--color-flow-pulse);
  stroke-width: 2.4;
}

.flow-preview__edge-lit--ai {
  stroke: var(--color-ai);
}

.flow-preview__pulse {
  fill: var(--color-flow-pulse);
}

.flow-preview__pulse--ai {
  fill: var(--color-ai);
}

.flow-preview__node {
  fill: var(--color-surface-container-lowest);
  stroke: var(--color-outline-variant);
  stroke-width: 1.5;
}

.flow-preview__node--sub {
  stroke: color-mix(in srgb, var(--color-ai) 50%, var(--color-outline-variant));
}

.flow-preview__node-glow {
  fill: var(--color-glow-soft);
  stroke: var(--color-flow-pulse);
  stroke-width: 2;
}

.flow-preview__content {
  display: flex;
  align-items: center;
  gap: 10px;
  /* Hosts like the landing hero centre their text; node content always reads left to right. */
  text-align: left;
  width: 100%;
  height: 100%;
  padding: 0 14px;
  box-sizing: border-box;
  color: var(--color-on-surface);
  font-family: inherit;
}

.flow-preview--card .flow-preview__content {
  justify-content: center;
  padding: 0;
}

.flow-preview__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--color-secondary-container);
  color: var(--color-primary);
  font-size: 20px;
}

.flow-preview--card .flow-preview__icon {
  width: 48px;
  height: 48px;
  font-size: 34px;
  background: transparent;
}

.flow-preview__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.flow-preview__name {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-preview__type {
  font-size: 11px;
  color: var(--color-on-surface-variant);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.flow-preview__done circle {
  fill: var(--color-success);
}

.flow-preview__done path {
  fill: none;
  stroke: var(--color-on-primary);
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.flow-preview--empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--color-on-surface-variant);
  font-size: 12px;
}
</style>
