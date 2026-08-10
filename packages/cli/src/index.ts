import { NODES_BASE_PACKAGE } from '@n8n-clone/nodes-base';

// Express app, REST controllers, TypeORM entities/migrations, auth, webhook receiver,
// scheduler, and BullMQ queue wiring land in M6/M7/M10.
export function getLoadedPackages(): string[] {
  return [NODES_BASE_PACKAGE];
}
