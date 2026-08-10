import type { INode } from './interfaces/node.interfaces.js';
import type { IWorkflowBase } from './interfaces/workflow.interfaces.js';

/**
 * Graph model over an IWorkflowBase: node lookup, traversal, execution-order
 * resolution, cycle detection, and the atomic node-rename operation.
 *
 * Real graph logic (traversal, execution order, cycle detection, rename) lands in M2 —
 * this is the M1 skeleton so the rest of the monorepo has a stable import target.
 */
export class Workflow {
  constructor(private readonly definition: IWorkflowBase) {}

  getNode(name: string): INode | undefined {
    return this.definition.nodes.find((node) => node.name === name);
  }
}
