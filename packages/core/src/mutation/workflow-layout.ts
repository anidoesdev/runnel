import type { IConnection, IWorkflowBase, NodeConnectionType } from '@n8n-clone/workflow';

/**
 * Horizontal distance between successive steps of the main flow, and vertical distance between
 * parallel branches at the same step. Matches the spacing the editor's own canvas already uses
 * for a comfortably-readable graph (node card width/height plus margin).
 */
const X_SPACING = 260;
const Y_SPACING = 180;
/** Sub-nodes (chat model, tool, ...) render below the node they feed, not inline with the main flow. */
const SUBNODE_Y_OFFSET = 200;

/**
 * Recomputes every node's canvas position from the connection graph, the way the editor's own
 * auto-layout would: main-flow nodes are placed left-to-right by longest-path depth from a root
 * (a node nothing feeds into), with parallel branches stacked vertically at the same depth;
 * ai_languageModel/ai_tool sub-nodes are placed underneath whichever node consumes them, mirroring
 * how the canvas actually renders an AI Agent's model/tool inputs. This replaces whatever position
 * each node carried before — call it after any change to `connections`, not after a bare add with
 * no wiring yet (a freshly added, still-unconnected node has no graph position to derive).
 */
export function layoutWorkflow(workflow: IWorkflowBase): IWorkflowBase {
  const cloned = structuredClone(workflow);
  const nodeOrder = cloned.nodes.map((n) => n.name);

  const mainEdges: Array<[string, string]> = [];
  /** First consumer wins if a sub-node were ever (unusually) wired to more than one node. */
  const subNodeConsumer = new Map<string, string>();

  for (const [from, entry] of Object.entries(cloned.connections)) {
    for (const [type, branches] of Object.entries(entry) as Array<[NodeConnectionType, IConnection[][]]>) {
      for (const branch of branches) {
        for (const c of branch) {
          if (type === 'main') mainEdges.push([from, c.node]);
          else if (!subNodeConsumer.has(from)) subNodeConsumer.set(from, c.node);
        }
      }
    }
  }

  const mainNodeNames = nodeOrder.filter((name) => !subNodeConsumer.has(name));
  const incoming = new Map<string, string[]>(mainNodeNames.map((name) => [name, []]));
  for (const [from, to] of mainEdges) {
    incoming.get(to)?.push(from);
  }

  const depthCache = new Map<string, number>();
  function depthOf(name: string, visiting: Set<string>): number {
    const cached = depthCache.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 0; // a back-edge (e.g. Split In Batches' loop output) — don't recurse into a cycle
    visiting.add(name);
    const preds = incoming.get(name) ?? [];
    const depth = preds.length === 0 ? 0 : Math.max(...preds.map((p) => depthOf(p, visiting) + 1));
    visiting.delete(name);
    depthCache.set(name, depth);
    return depth;
  }
  for (const name of mainNodeNames) depthOf(name, new Set());

  const byDepth = new Map<number, string[]>();
  for (const name of mainNodeNames) {
    const depth = depthCache.get(name)!;
    const bucket = byDepth.get(depth);
    if (bucket) bucket.push(name);
    else byDepth.set(depth, [name]);
  }

  const positions = new Map<string, [number, number]>();
  for (const [depth, names] of byDepth) {
    const top = (-(names.length - 1) * Y_SPACING) / 2;
    names.forEach((name, i) => positions.set(name, [depth * X_SPACING, top + i * Y_SPACING]));
  }

  const subNodesByConsumer = new Map<string, string[]>();
  for (const [subName, consumer] of subNodeConsumer) {
    const bucket = subNodesByConsumer.get(consumer);
    if (bucket) bucket.push(subName);
    else subNodesByConsumer.set(consumer, [subName]);
  }
  for (const [consumer, subNames] of subNodesByConsumer) {
    const consumerPos = positions.get(consumer);
    if (!consumerPos) continue; // consumer isn't in the main graph (shouldn't normally happen)
    const left = (-(subNames.length - 1) * X_SPACING) / 2;
    subNames.forEach((subName, i) => positions.set(subName, [consumerPos[0] + left + i * X_SPACING, consumerPos[1] + SUBNODE_Y_OFFSET]));
  }

  for (const node of cloned.nodes) {
    const position = positions.get(node.name);
    if (position) node.position = position;
  }

  return cloned;
}
