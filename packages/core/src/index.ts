import type { IWorkflowBase } from '@n8n-clone/workflow';

// Placeholder export for M1. WorkflowExecute, binary data manager, credential
// encrypt/decrypt, sandboxed code execution, node loader, and HTTP helper land in M4/M5.
export function describeWorkflow(workflow: IWorkflowBase): string {
  return `${workflow.name} (${workflow.nodes.length} nodes)`;
}
