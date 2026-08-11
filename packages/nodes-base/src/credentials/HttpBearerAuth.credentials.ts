import type { ICredentialType } from '@n8n-clone/workflow';

/** The canonical example of the declarative pattern: a fixed header name ("Authorization") with a templated value, so `authenticate.generic` alone is enough — no node-side special-casing needed. */
export const httpBearerAuth: ICredentialType = {
  name: 'httpBearerAuth',
  displayName: 'Bearer Token Auth',
  properties: [{ displayName: 'Token', name: 'token', type: 'string', default: '', typeOptions: { password: true } }],
  authenticate: {
    type: 'generic',
    properties: { headers: { Authorization: '=Bearer {{$credentials.token}}' } },
  },
};
