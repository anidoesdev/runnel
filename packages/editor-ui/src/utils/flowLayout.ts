import type { IConnections, INode, NodeConnectionType } from '@runnel/workflow';

export interface IFlowMetrics {
  nodeWidth: number;
  nodeHeight: number;
  /** Horizontal distance between the left edges of consecutive steps. */
  gapX: number;
  /** Vertical distance between the top edges of stacked nodes. */
  gapY: number;
}

export interface IFlowNodeBox {
  name: string;
  type: string;
  x: number;
  y: number;
  /** The execution step this node runs in (0 = the trigger). Sub-nodes share their agent's step. */
  step: number;
  /** A chat model or tool feeding an agent, rather than a node on the main data path. */
  isSubNode: boolean;
}

export interface IFlowEdge {
  id: string;
  kind: 'main' | 'ai';
  path: string;
  /** The step during which data travels along this edge. */
  step: number;
}

export interface IFlowLayout {
  nodes: IFlowNodeBox[];
  edges: IFlowEdge[];
  /** Number of execution steps, so an animation knows how long one run takes. */
  steps: number;
  viewBox: { x: number; y: number; width: number; height: number };
}

const PADDING = 24;

interface IRawEdge {
  from: string;
  to: string;
  type: NodeConnectionType;
}

function collectEdges(nodes: Array<Pick<INode, 'name'>>, connections: IConnections): IRawEdge[] {
  const known = new Set(nodes.map((node) => node.name));
  const edges: IRawEdge[] = [];
  for (const [from, byType] of Object.entries(connections)) {
    if (!known.has(from)) continue;
    for (const [type, branches] of Object.entries(byType ?? {}) as Array<[NodeConnectionType, Array<Array<{ node: string }>>]>) {
      for (const branch of branches ?? []) {
        for (const connection of branch ?? []) {
          if (known.has(connection.node) && connection.node !== from) edges.push({ from, to: connection.node, type });
        }
      }
    }
  }
  return edges;
}

/**
 * Longest-path step for every node on the main data path, starting from nodes nothing feeds.
 * Relaxation is capped at one pass per node, so a loop (Split In Batches feeding back) can't spin
 * forever — the nodes in it simply keep the step they reached.
 */
function assignSteps(names: string[], mainEdges: IRawEdge[]): Map<string, number> {
  const step = new Map(names.map((name) => [name, 0]));
  for (let pass = 0; pass < names.length; pass++) {
    let changed = false;
    for (const edge of mainEdges) {
      const next = step.get(edge.from)! + 1;
      if (next > step.get(edge.to)! && next < names.length) {
        step.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return step;
}

function mainPath(sx: number, sy: number, tx: number, ty: number): string {
  const bend = Math.max(36, Math.abs(tx - sx) / 2);
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
}

function aiPath(sx: number, sy: number, tx: number, ty: number): string {
  const bend = Math.max(24, Math.abs(sy - ty) / 2);
  return `M ${sx} ${sy} C ${sx} ${sy - bend}, ${tx} ${ty + bend}, ${tx} ${ty}`;
}

/**
 * Lays a workflow out as a tidy left-to-right flow for previews — by execution step rather than
 * the positions the user dragged nodes to, so every thumbnail reads the same way. Within a step,
 * nodes keep the user's vertical order. Chat models and tools sit under the agent they feed.
 */
export function layoutFlow(
  nodes: Array<Pick<INode, 'name' | 'type' | 'position'>>,
  connections: IConnections,
  metrics: IFlowMetrics,
): IFlowLayout {
  if (nodes.length === 0) return { nodes: [], edges: [], steps: 0, viewBox: { x: 0, y: 0, width: 1, height: 1 } };

  const raw = collectEdges(nodes, connections);
  const mainEdges = raw.filter((edge) => edge.type === 'main');
  const aiEdges = raw.filter((edge) => edge.type !== 'main');
  const subNodeNames = new Set(aiEdges.map((edge) => edge.from));
  const mainNames = nodes.map((node) => node.name).filter((name) => !subNodeNames.has(name));

  const steps = assignSteps(mainNames, mainEdges);
  const byName = new Map(nodes.map((node) => [node.name, node]));

  const columns = new Map<number, string[]>();
  for (const name of mainNames) {
    const column = columns.get(steps.get(name)!) ?? [];
    column.push(name);
    columns.set(steps.get(name)!, column);
  }

  const boxes = new Map<string, IFlowNodeBox>();
  for (const [step, names] of columns) {
    names.sort((a, b) => byName.get(a)!.position[1] - byName.get(b)!.position[1] || a.localeCompare(b));
    names.forEach((name, row) => {
      boxes.set(name, {
        name,
        type: byName.get(name)!.type,
        x: step * metrics.gapX,
        y: (row - (names.length - 1) / 2) * metrics.gapY,
        step,
        isSubNode: false,
      });
    });
  }

  // Sub-nodes: a row under their agent, spread evenly around its centre.
  const subNodesByTarget = new Map<string, string[]>();
  for (const edge of aiEdges) {
    const list = subNodesByTarget.get(edge.to) ?? [];
    if (!list.includes(edge.from)) list.push(edge.from);
    subNodesByTarget.set(edge.to, list);
  }
  for (const [target, subs] of subNodesByTarget) {
    const agent = boxes.get(target);
    if (!agent) continue;
    subs.forEach((name, i) => {
      if (boxes.has(name)) return;
      const spread = metrics.nodeWidth + metrics.gapX * 0.15;
      boxes.set(name, {
        name,
        type: byName.get(name)!.type,
        x: agent.x + (i - (subs.length - 1) / 2) * spread,
        y: agent.y + metrics.gapY,
        step: agent.step,
        isSubNode: true,
      });
    });
  }
  // A sub-node whose agent isn't on the page still needs a place.
  for (const name of subNodeNames) {
    if (!boxes.has(name)) boxes.set(name, { name, type: byName.get(name)!.type, x: 0, y: metrics.gapY, step: 0, isSubNode: true });
  }

  const { nodeWidth: w, nodeHeight: h } = metrics;
  const edges: IFlowEdge[] = raw.map((edge, index) => {
    const source = boxes.get(edge.from)!;
    const target = boxes.get(edge.to)!;
    return edge.type === 'main'
      ? { id: `e${index}`, kind: 'main', step: source.step, path: mainPath(source.x + w, source.y + h / 2, target.x, target.y + h / 2) }
      : { id: `e${index}`, kind: 'ai', step: target.step, path: aiPath(source.x + w / 2, source.y, target.x + w / 2, target.y + h) };
  });

  const all = [...boxes.values()];
  const minX = Math.min(...all.map((box) => box.x)) - PADDING;
  const minY = Math.min(...all.map((box) => box.y)) - PADDING;
  const maxX = Math.max(...all.map((box) => box.x + w)) + PADDING;
  const maxY = Math.max(...all.map((box) => box.y + h)) + PADDING;

  return {
    nodes: nodes.map((node) => boxes.get(node.name)!),
    edges,
    steps: Math.max(...all.map((box) => box.step)) + 1,
    viewBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

export interface IFlowTiming {
  /** Seconds for one full loop: the run itself plus a pause before it replays. */
  cycle: number;
  /** When, as a fraction of the cycle, a step starts and ends. */
  stepWindow(step: number): { start: number; end: number };
  /** A node glows while it "runs": the first part of its step. */
  nodeWindow(step: number): { start: number; end: number };
  /** Data travels along an edge in the rest of its step, arriving as the next step begins. */
  edgeWindow(step: number): { start: number; end: number };
}

export const STEP_SECONDS = 1.1;
export const REST_SECONDS = 1.6;
/** Share of a step a node spends running before its output leaves along the edges. */
const RUN_SHARE = 0.55;

/** Every animation shares one cycle length and starts together, so the loop stays in sync without any script. */
export function flowTiming(steps: number): IFlowTiming {
  const cycle = Math.max(1, steps) * STEP_SECONDS + REST_SECONDS;
  const stepWindow = (step: number) => ({ start: (step * STEP_SECONDS) / cycle, end: ((step + 1) * STEP_SECONDS) / cycle });
  return {
    cycle,
    stepWindow,
    nodeWindow(step) {
      const { start, end } = stepWindow(step);
      return { start, end: start + (end - start) * RUN_SHARE };
    },
    edgeWindow(step) {
      const { start, end } = stepWindow(step);
      return { start: start + (end - start) * RUN_SHARE, end };
    },
  };
}

/**
 * SMIL `values`/`keyTimes` for "off, on during [start, end], off" — used for glows and pulses.
 * Equal neighbouring key times are allowed (an instant switch), so a window starting at 0 is fine.
 */
export function onWindow(start: number, end: number, fade = 0.02): { values: string; keyTimes: string } {
  const on = Math.min(end, start + fade);
  const off = Math.min(1, end + fade);
  return {
    values: '0;0;1;1;0;0',
    keyTimes: [0, start, on, end, off, 1].map((t) => Number(t.toFixed(4))).join(';'),
  };
}
