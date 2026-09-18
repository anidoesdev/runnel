import type { ICredentialType } from '@runnel/workflow';

/** Same reasoning as HttpHeaderAuth: the query-parameter name is a credential field, not a fixed key, so this is special-cased in the HTTP Request node rather than declared via `authenticate.generic`. */
export const httpQueryAuth: ICredentialType = {
  name: 'httpQueryAuth',
  displayName: 'Query Auth',
  properties: [
    { displayName: 'Name', name: 'name', type: 'string', default: '' },
    { displayName: 'Value', name: 'value', type: 'string', default: '', typeOptions: { password: true } },
  ],
};
