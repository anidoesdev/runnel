import { NodeGraph } from './graph.js';
import { WorkflowOperationError } from './interfaces/errors.js';
import { renameNodeReferencesInParameters } from './expression-reference-rewriter.js';
import type { INode, NodeConnectionType } from './interfaces/node.interfaces.js';
import type { IConnection, IConnections, IWorkflowBase } from './interfaces/workflow.interfaces.js';

export interface IllegalCycle {
  nodes: string[];
}

/**
 * Graph model over an IWorkflowBase: node lookup, traversal, execution-order resolution,
 * cycle detection, and the atomic node-rename operation.
 *
 * This class has no notion of *what* a node does — node-type-dependent decisions (is this
 * type allowed to loop?) are injected by the caller as a predicate rather than looked up
 * here, since the node-type registry lives in packages/core, one layer below this one.
 */
export class Workflow {
  constructor(private readonly definition: IWorkflowBase) {}

  private buildGraph(): NodeGraph {
    return new NodeGraph(
      this.definition.nodes.map((node) => node.name),
      this.definition.connections,
    );
  }

  getNode(name: string): INode | undefined {
    return this.definition.nodes.find((node) => node.name === name);
  }

  /** A deep-cloned, JSON-serializable snapshot of the underlying definition. */
  toJSON(): IWorkflowBase {
    return structuredClone(this.definition);
  }

  /** Direct + transitive descendants of `name`, excluding `name` itself. `depth: -1` (default) means unlimited. */
  getChildNodes(name: string, depth = -1): string[] {
    return this.buildGraph().reachable(name, 'forward', depth);
  }

  /** Direct + transitive ancestors of `name`, excluding `name` itself. `depth: -1` (default) means unlimited. */
  getParentNodes(name: string, depth = -1): string[] {
    return this.buildGraph().reachable(name, 'backward', depth);
  }

  /**
   * Every node whose `type`-typed connection targets `nodeName` at `inputIndex` (default 0),
   * in the order they appear in the workflow's `connections`. Unlike `main`, these connection
   * types are never traversed by NodeGraph — a sub-node (a chat model, a tool) has no `main`
   * edge to be reachable through, so this is a direct reverse scan of the raw connections
   * rather than a graph walk. Used by the execution engine to resolve
   * IExecuteFunctions.getInputConnectionData.
   */
  getConnectedSubNodes(nodeName: string, type: NodeConnectionType, inputIndex = 0): string[] {
    const sources: string[] = [];
    for (const [source, entry] of Object.entries(this.definition.connections)) {
      for (const branch of entry[type] ?? []) {
        for (const connection of branch) {
          if (connection.node === nodeName && connection.index === inputIndex) sources.push(source);
        }
      }
    }
    return sources;
  }

  /**
   * A cycle is legal only if at least one of its members is an "iteration node"
   * (SplitInBatches / Loop Over Items) — decided by the caller-supplied predicate, since
   * this package has no node-type registry of its own. A self-loop (a node connected to
   * itself) counts as a size-1 cycle.
   */
  detectIllegalCycles(isIterationNode: (nodeType: string) => boolean = () => false): IllegalCycle[] {
    const graph = this.buildGraph();
    const illegal: IllegalCycle[] = [];

    for (const component of graph.stronglyConnectedComponents()) {
      const isCycle = component.length > 1 || graph.children(component[0]!).includes(component[0]!);
      if (!isCycle) continue;

      const hasIterationNode = component.some((name) => {
        const node = this.getNode(name);
        return node ? isIterationNode(node.type) : false;
      });

      if (!hasIterationNode) illegal.push({ nodes: component });
    }

    return illegal;
  }

  /**
   * Structural execution order: a topological sort of the graph's strongly-connected-
   * component condensation (which is always acyclic), with each multi-node component
   * (a legal loop) internally ordered by BFS from its entry node. This returns each node
   * once — the runtime engine (packages/core, M4) is what re-enters a loop body across
   * multiple `runIndex`es; this method only establishes the structural order of a single pass.
   */
  getExecutionOrder(startNode: string): string[] {
    if (!this.getNode(startNode)) {
      throw new WorkflowOperationError(`Node "${startNode}" not found.`);
    }

    const graph = this.buildGraph();
    const reachable = new Set([startNode, ...graph.reachable(startNode, 'forward')]);
    const components = graph
      .stronglyConnectedComponents()
      .filter((component) => component.some((node) => reachable.has(node)));

    const componentIndexOf = new Map<string, number>();
    components.forEach((component, i) => component.forEach((node) => componentIndexOf.set(node, i)));

    const outEdges: Set<number>[] = components.map(() => new Set());
    const inDegree: number[] = components.map(() => 0);
    components.forEach((component, i) => {
      for (const node of component) {
        for (const child of graph.children(node)) {
          const j = componentIndexOf.get(child);
          if (j === undefined || j === i || outEdges[i]!.has(j)) continue;
          outEdges[i]!.add(j);
          inDegree[j]!++;
        }
      }
    });

    const startComponentIndex = componentIndexOf.get(startNode)!;
    const queue: number[] = [];
    const queued = new Set<number>();
    const enqueueReady = (i: number): void => {
      if (inDegree[i] === 0 && !queued.has(i)) {
        queued.add(i);
        queue.push(i);
      }
    };
    components.forEach((_, i) => enqueueReady(i));
    queue.sort((a, b) => Number(a !== startComponentIndex) - Number(b !== startComponentIndex));

    const componentOrder: number[] = [];
    while (queue.length > 0) {
      const i = queue.shift()!;
      componentOrder.push(i);
      for (const j of outEdges[i]!) {
        inDegree[j]!--;
        if (inDegree[j] === 0) enqueueReady(j);
      }
    }

    if (componentOrder.length !== components.length) {
      throw new WorkflowOperationError(
        'Execution order resolution failed: the strongly-connected-component condensation was not acyclic.',
      );
    }

    const order: string[] = [];
    for (const i of componentOrder) {
      const preferredEntry = order.length === 0 ? startNode : undefined;
      order.push(...this.orderWithinComponent(components[i]!, graph, preferredEntry));
    }
    return order;
  }

  private orderWithinComponent(component: string[], graph: NodeGraph, preferredEntry?: string): string[] {
    if (component.length === 1) return component;

    const componentSet = new Set(component);
    const entry =
      component.find((node) => node === preferredEntry) ??
      component.find((node) => graph.parents(node).some((parent) => !componentSet.has(parent))) ??
      component[0]!;

    const visited = new Set<string>();
    const order: string[] = [];
    const queue = [entry];
    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node)) continue;
      visited.add(node);
      order.push(node);
      for (const child of graph.children(node)) {
        if (componentSet.has(child) && !visited.has(child)) queue.push(child);
      }
    }

    for (const node of component) {
      if (!visited.has(node)) order.push(node);
    }
    return order;
  }

  /**
   * A workflow definition containing only `destinationNode` and its transitive ancestors,
   * with `destinationNode`'s own outgoing connections dropped. Running this through the
   * normal execution engine naturally stops once `destinationNode` has executed, since
   * there's nothing left downstream of it to propagate into — that's what makes "run up to
   * this node" (the editor's per-node test button) possible without any change to the
   * engine itself: prune first, then run the pruned definition exactly like any other.
   */
  pruneToDestination(destinationNode: string): IWorkflowBase {
    if (!this.getNode(destinationNode)) {
      throw new WorkflowOperationError(`Node "${destinationNode}" not found.`);
    }

    const keep = new Set([destinationNode, ...this.getParentNodes(destinationNode)]);

    // Sub-node connections (ai_languageModel, ai_tool, ...) aren't part of the main graph, so
    // getParentNodes above never sees them — a node supplying one into anything we're keeping
    // must be kept too, or that node loses its language model/tools when the pruned workflow
    // runs. Fixed-point since a kept sub-node could itself depend on another sub-node.
    let grew = true;
    while (grew) {
      grew = false;
      for (const [source, entry] of Object.entries(this.definition.connections)) {
        if (keep.has(source)) continue;
        for (const [type, branches] of Object.entries(entry)) {
          if (type === 'main') continue;
          const targetsKept = (branches ?? []).some((branch) => branch.some((c) => keep.has(c.node)));
          if (targetsKept) {
            keep.add(source);
            grew = true;
            break;
          }
        }
      }
    }

    const cloned = structuredClone(this.definition);
    cloned.nodes = cloned.nodes.filter((node) => keep.has(node.name));

    const prunedConnections: IConnections = {};
    for (const [source, connection] of Object.entries(cloned.connections)) {
      if (source === destinationNode || !keep.has(source)) continue;
      const prunedEntry: IConnections[string] = {};
      for (const [type, branches] of Object.entries(connection) as Array<[NodeConnectionType, IConnection[][]]>) {
        prunedEntry[type] = branches.map((branch) => branch.filter((entry) => keep.has(entry.node)));
      }
      prunedConnections[source] = prunedEntry;
    }
    cloned.connections = prunedConnections;

    return cloned;
  }

  /**
   * Renames a node atomically: the node itself, every connection that references it (as
   * source key or as a target), its pinData entry, and every `$node["Old"]` / `$("Old")`
   * reference inside every other node's expression-enabled parameters. Returns a new
   * Workflow — the underlying definition is not mutated in place.
   */
  renameNode(oldName: string, newName: string): Workflow {
    if (oldName === newName) return this;
    if (!this.getNode(oldName)) {
      throw new WorkflowOperationError(`Node "${oldName}" not found.`);
    }
    if (this.getNode(newName)) {
      throw new WorkflowOperationError(`A node named "${newName}" already exists.`);
    }

    const cloned = structuredClone(this.definition);

    for (const node of cloned.nodes) {
      if (node.name === oldName) node.name = newName;
    }

    const newConnections: IConnections = {};
    for (const [source, connection] of Object.entries(cloned.connections)) {
      const renamedEntry: IConnections[string] = {};
      for (const [type, branches] of Object.entries(connection) as Array<[NodeConnectionType, IConnection[][]]>) {
        renamedEntry[type] = branches.map((branch) =>
          branch.map((entry) => (entry.node === oldName ? { ...entry, node: newName } : entry)),
        );
      }
      newConnections[source === oldName ? newName : source] = renamedEntry;
    }
    cloned.connections = newConnections;

    if (cloned.pinData && oldName in cloned.pinData) {
      const { [oldName]: renamedData, ...rest } = cloned.pinData;
      cloned.pinData = { ...rest, [newName]: renamedData! };
    }

    for (const node of cloned.nodes) {
      node.parameters = renameNodeReferencesInParameters(node.parameters, oldName, newName);
    }

    return new Workflow(cloned);
  }
}
