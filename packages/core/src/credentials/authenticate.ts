import { isExpression } from '@n8n-clone/workflow';
import type { ICredentialType, IDataObject, IHttpRequestOptions } from '@n8n-clone/workflow';

/**
 * Applies a credential type's declarative `authenticate.generic` block to a set of request
 * options — the preferred way to wire a credential into a request (over each node hand-
 * injecting headers itself, per the M1 architecture note). Values may reference
 * `{{ $credentials.field }}`. `$credentials` is scoped to this one caller (credential
 * templates only ever need to reference their own fields), so it's resolved directly here
 * rather than stretching the shared node-expression scope table for a single symbol.
 */
function resolveTemplate(template: string, credentials: IDataObject): string {
  if (!isExpression(template)) return template;
  const body = template.slice(1);
  return body.replace(/\{\{\s*\$credentials\.([a-zA-Z0-9_]+)\s*\}\}/g, (_all, field: string) =>
    String(credentials[field] ?? ''),
  );
}

export function applyCredentialAuthentication(
  options: IHttpRequestOptions,
  credentialType: ICredentialType,
  credentials: IDataObject,
): IHttpRequestOptions {
  if (!credentialType.authenticate) return options;

  const { headers, qs, body } = credentialType.authenticate.properties;
  const result: IHttpRequestOptions = {
    ...options,
    headers: { ...options.headers },
    qs: { ...options.qs },
  };

  if (headers) {
    for (const [key, value] of Object.entries(headers)) {
      result.headers![key] = resolveTemplate(value, credentials);
    }
  }
  if (qs) {
    for (const [key, value] of Object.entries(qs)) {
      result.qs![key] = resolveTemplate(value, credentials);
    }
  }
  if (body) {
    const existingBody = typeof result.body === 'object' && result.body !== null ? result.body : {};
    result.body = { ...existingBody, ...body };
  }

  return result;
}
