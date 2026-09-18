import type { IWorkflowBase } from '@runnel/workflow';

/**
 * The only seam between this package and however workflows are actually persisted (TypeORM in
 * packages/cli today). Keeps the draft/tool layer testable with an in-memory fake and reusable
 * from a future MCP server or script without dragging in Express/TypeORM.
 */
export interface IWorkflowRepositoryPort {
  get(workflowId: string): Promise<IWorkflowBase>;
  save(workflowId: string, workflow: IWorkflowBase): Promise<IWorkflowBase>;
}
