import { allNodeTypes } from '@n8n-clone/nodes-base';

// Express app, REST controllers, TypeORM entities/migrations, auth, webhook receiver,
// scheduler, and BullMQ queue wiring land in M6/M7/M10.
export function getLoadedNodeTypeNames(): string[] {
  return allNodeTypes.map((nodeType) => nodeType.description.name);
}
