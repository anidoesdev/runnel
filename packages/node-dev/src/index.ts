import type { INodeTypeDescription } from '@n8n-clone/workflow';

// Scaffolding commands (new node, new credential, build, lint against the schema
// validator) land alongside M11's node-library breadth work.
export function validateNodeName(description: Pick<INodeTypeDescription, 'name'>): boolean {
  return /^[a-z][a-zA-Z0-9]*$/.test(description.name);
}
