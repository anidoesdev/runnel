import type { ICredentialType } from '@runnel/workflow';

/** No `authenticate`/`test` block — those model declarative HTTP request auth (headers/query/body substitution), which doesn't apply to a raw TCP database connection. The Postgres node connects with these fields directly instead. */
export const postgresApi: ICredentialType = {
  name: 'postgresApi',
  displayName: 'Postgres',
  properties: [
    { displayName: 'Host', name: 'host', type: 'string', default: 'localhost' },
    { displayName: 'Port', name: 'port', type: 'number', default: 5432 },
    { displayName: 'Database', name: 'database', type: 'string', default: '' },
    { displayName: 'User', name: 'user', type: 'string', default: 'postgres' },
    { displayName: 'Password', name: 'password', type: 'string', default: '', typeOptions: { password: true } },
    { displayName: 'SSL', name: 'ssl', type: 'boolean', default: false },
  ],
};
