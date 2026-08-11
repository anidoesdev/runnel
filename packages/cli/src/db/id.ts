import { randomUUID } from 'node:crypto';

/** Every entity's primary key is generated here, in application code, rather than via a DB-native default — see the entity files for why. */
export function generateId(): string {
  return randomUUID();
}
