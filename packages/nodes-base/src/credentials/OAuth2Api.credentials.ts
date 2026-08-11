import type { ICredentialType } from '@n8n-clone/workflow';

/**
 * The credential type/field schema only. The actual OAuth2 authorization-code flow
 * (authorize redirect, callback handler, token storage, automatic refresh on 401) needs a
 * running Express server to receive the redirect — that's explicitly M6 work per the
 * project spec. Selecting this credential type on a node is safe to model now; it just
 * can't successfully authenticate a request yet.
 */
export const oAuth2Api: ICredentialType = {
  name: 'oAuth2Api',
  displayName: 'OAuth2 API',
  properties: [
    { displayName: 'Client ID', name: 'clientId', type: 'string', default: '' },
    { displayName: 'Client Secret', name: 'clientSecret', type: 'string', default: '', typeOptions: { password: true } },
    { displayName: 'Authorization URL', name: 'authUrl', type: 'string', default: '' },
    { displayName: 'Access Token URL', name: 'accessTokenUrl', type: 'string', default: '' },
    { displayName: 'Scope', name: 'scope', type: 'string', default: '' },
  ],
};
