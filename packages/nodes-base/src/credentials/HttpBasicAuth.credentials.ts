import type { ICredentialType } from '@runnel/workflow';

/**
 * Basic Auth's header value (`Basic base64(user:password)`) needs an actual base64
 * encoding step that the declarative `authenticate.generic` template substitution can't
 * express — it only ever substitutes `{{ $credentials.field }}` with a plain string, it
 * doesn't evaluate functions. So unlike HttpBearerAuth, this credential type carries no
 * `authenticate` block; the HTTP Request node special-cases this one credential type name
 * to compute the header itself. HttpHeaderAuth/HttpQueryAuth are special-cased for a
 * different reason: the header/query-param *name* is itself a credential field, and
 * `authenticate.generic.properties.headers` keys are fixed at credential-type-definition
 * time, not per-credential-instance.
 */
export const httpBasicAuth: ICredentialType = {
  name: 'httpBasicAuth',
  displayName: 'Basic Auth',
  properties: [
    { displayName: 'User', name: 'user', type: 'string', default: '' },
    { displayName: 'Password', name: 'password', type: 'string', default: '', typeOptions: { password: true } },
  ],
};
