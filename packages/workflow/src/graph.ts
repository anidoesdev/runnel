import type { IConnections } from './interfaces/workflow.interfaces.js';

/** Adjacency built once from IConnections so traversal/SCC/topo-sort don't re-walk the raw shape. */
export class NodeGraph {
  private readonly forward = new Map<string, Set<string>>();
  private readonly backward = new Map<string, Set<string>>();

  constructor(nodeNames: string[], connections: IConnections) {
    for (const name of nodeNames) {
      this.forward.set(name, new Set());
      this.backward.set(name, new Set());
    }

    for (const [source, connection] of Object.entries(connections)) {
      for (const branch of connection.main) {
        for (const target of branch) {
          this.forward.get(source)?.add(target.node);
          if (!this.backward.has(target.node)) this.backward.set(target.node, new Set());
          this.backward.get(target.node)!.add(source);
          if (!this.forward.has(source)) this.forward.set(source, new Set());
        }
      }
    }
  }

  children(name: string): string[] {
    return [...(this.forward.get(name) ?? [])];
  }

  parents(name: string): string[] {
    return [...(this.backward.get(name) ?? [])];
  }

  allNodes(): string[] {
    return [...this.forward.keys()];
  }

  /** BFS over `children`/`parents`, deduplicated, excluding the start node itself. */
  reachable(start: string, direction: 'forward' | 'backward', depth = -1): string[] {
    const next = direction === 'forward' ? (n: string) => this.children(n) : (n: string) => this.parents(n);
    const visited = new Set<string>();
    let frontier = [start];
    let currentDepth = 0;

    while (frontier.length > 0 && (depth === -1 || currentDepth < depth)) {
      const nextFrontier: string[] = [];
      for (const node of frontier) {
        for (const neighbor of next(node)) {
          if (neighbor !== start && !visited.has(neighbor)) {
            visited.add(neighbor);
            nextFrontier.push(neighbor);
          }
        }
      }
      frontier = nextFrontier;
      currentDepth++;
    }

    return [...visited];
  }

  /**
   * Tarjan's strongly-connected-components algorithm. A single-node component is only a
   * cycle if that node has a self-edge; callers that care about "is this a cycle" must
   * check `children(node).includes(node)` for size-1 components themselves.
   */
  stronglyConnectedComponents(): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const result: string[][] = [];

    const strongConnect = (v: string): void => {
      indices.set(v, index);
      lowlink.set(v, index);
      index++;
      stack.push(v);
      onStack.add(v);

      for (const w of this.children(v)) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
        } else if (onStack.has(w)) {
          lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
        }
      }

      if (lowlink.get(v) === indices.get(v)) {
        const component: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          component.push(w);
        } while (w !== v);
        result.push(component);
      }
    };

    for (const name of this.allNodes()) {
      if (!indices.has(name)) strongConnect(name);
    }

    return result;
  }
}
