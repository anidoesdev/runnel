import type { ICredentialType } from '@n8n-clone/workflow';

/** The header *name* is itself user-defined per credential instance, so this can't be expressed as a fixed key in a declarative `authenticate.generic.headers` block — the HTTP Request node reads `name`/`value` directly and sets that header itself. */
export const httpHeaderAuth: ICredentialType = {
  name: 'httpHeaderAuth',
  displayName: 'Header Auth',
  properties: [
    { displayName: 'Name', name: 'name', type: 'string', default: '' },
    { displayName: 'Value', name: 'value', type: 'string', default: '', typeOptions: { password: true } },
  ],
};
