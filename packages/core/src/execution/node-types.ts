import type { INodeType } from '@n8n-clone/workflow';

/**
 * Decouples WorkflowExecute from how node types are actually loaded/versioned. The real
 * loader (scanning nodes-base/dist, custom extensions, VersionedNodeType resolution) lands
 * in M5 — for now this is just the seam, and tests supply a trivial Map-backed registry.
 */
export interface INodeTypes {
  getByNameAndVersion(type: string, version?: number): INodeType;
}

export class MapNodeTypes implements INodeTypes {
  private readonly types = new Map<string, INodeType>();

  register(type: INodeType): this {
    this.types.set(type.description.name, type);
    return this;
  }

  getByNameAndVersion(type: string): INodeType {
    const nodeType = this.types.get(type);
    if (!nodeType) {
      throw new Error(`Unknown node type "${type}"`);
    }
    return nodeType;
  }
}
