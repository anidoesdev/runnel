import type { INodeType, INodeTypeDescription, VersionedNodeType } from '@n8n-clone/workflow';

/**
 * Decouples WorkflowExecute from how node types are actually loaded/versioned. The real
 * loader (scanning nodes-base/dist, custom extensions, lazy known/nodes.json indexing) is a
 * CLI-startup concern that lands in M6 — this is just the seam. `MapNodeTypes` resolves
 * VersionedNodeType entries (a saved node pins `typeVersion`; unversioned node types just
 * return themselves regardless of what version is asked for, matching how a node with a
 * single `version: 1` behaves in practice).
 */
export interface INodeTypes {
  getByNameAndVersion(type: string, version?: number): INodeType;
  /** Every registered type's description, one entry per type name (its current/default version) — the catalog search_nodes/get_workflow_outline read from. */
  list(): INodeTypeDescription[];
}

export type RegisterableNodeType = INodeType | VersionedNodeType;

function isVersioned(type: RegisterableNodeType): type is VersionedNodeType {
  return 'nodeVersions' in type;
}

export class MapNodeTypes implements INodeTypes {
  private readonly types = new Map<string, RegisterableNodeType>();

  register(type: RegisterableNodeType): this {
    this.types.set(type.description.name, type);
    return this;
  }

  getByNameAndVersion(type: string, version?: number): INodeType {
    const entry = this.types.get(type);
    if (!entry) {
      throw new Error(`Unknown node type "${type}"`);
    }
    if (!isVersioned(entry)) return entry;

    const resolvedVersion = version ?? entry.currentVersion;
    const nodeType = entry.nodeVersions[resolvedVersion];
    if (!nodeType) {
      throw new Error(`Unknown version ${resolvedVersion} of node type "${type}"`);
    }
    return nodeType;
  }

  list(): INodeTypeDescription[] {
    return [...this.types.values()].map((entry) => entry.description);
  }
}
