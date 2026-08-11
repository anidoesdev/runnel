import { describe, expect, it } from 'vitest';
import { applyCredentialAuthentication } from './authenticate.js';
import type { ICredentialType } from '@n8n-clone/workflow';

describe('applyCredentialAuthentication', () => {
  it('returns the options unchanged when the credential type has no authenticate block', () => {
    const credentialType: ICredentialType = { name: 'none', displayName: 'None', properties: [] };
    const options = { url: 'http://x', headers: { existing: '1' } };
    expect(applyCredentialAuthentication(options, credentialType, {})).toEqual(options);
  });

  it('injects a header with an embedded credential field, keeping surrounding text', () => {
    const credentialType: ICredentialType = {
      name: 'apiKeyAuth',
      displayName: 'API Key',
      properties: [],
      authenticate: { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } } },
    };
    const result = applyCredentialAuthentication({ url: 'http://x' }, credentialType, { apiKey: 'sk-123' });
    expect(result.headers!.Authorization).toBe('Bearer sk-123');
  });

  it('substitutes an empty string when the referenced credential field is missing', () => {
    const credentialType: ICredentialType = {
      name: 'apiKeyAuth',
      displayName: 'API Key',
      properties: [],
      authenticate: { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } } },
    };
    const result = applyCredentialAuthentication({ url: 'http://x' }, credentialType, {});
    expect(result.headers!.Authorization).toBe('Bearer ');
  });

  it('injects query-string parameters', () => {
    const credentialType: ICredentialType = {
      name: 'queryAuth',
      displayName: 'Query Auth',
      properties: [],
      authenticate: { type: 'generic', properties: { qs: { api_key: '={{$credentials.apiKey}}' } } },
    };
    const result = applyCredentialAuthentication({ url: 'http://x' }, credentialType, { apiKey: 'sk-123' });
    expect(result.qs!.api_key).toBe('sk-123');
  });

  it('merges declarative body fields with any existing body', () => {
    const credentialType: ICredentialType = {
      name: 'bodyAuth',
      displayName: 'Body Auth',
      properties: [],
      authenticate: { type: 'generic', properties: { body: { client_secret: 'shh' } } },
    };
    const result = applyCredentialAuthentication(
      { url: 'http://x', body: { grant_type: 'client_credentials' } },
      credentialType,
      {},
    );
    expect(result.body).toEqual({ grant_type: 'client_credentials', client_secret: 'shh' });
  });

  it('creates a body from scratch when there was none to begin with', () => {
    const credentialType: ICredentialType = {
      name: 'bodyAuth',
      displayName: 'Body Auth',
      properties: [],
      authenticate: { type: 'generic', properties: { body: { client_secret: 'shh' } } },
    };
    const result = applyCredentialAuthentication({ url: 'http://x' }, credentialType, {});
    expect(result.body).toEqual({ client_secret: 'shh' });
  });

  it('leaves a non-expression header value untouched (no leading "=")', () => {
    const credentialType: ICredentialType = {
      name: 'staticAuth',
      displayName: 'Static',
      properties: [],
      authenticate: { type: 'generic', properties: { headers: { 'X-Static': 'fixed-value' } } },
    };
    const result = applyCredentialAuthentication({ url: 'http://x' }, credentialType, {});
    expect(result.headers!['X-Static']).toBe('fixed-value');
  });

  it('does not mutate the original options object', () => {
    const original = { url: 'http://x', headers: { keep: '1' } };
    const credentialType: ICredentialType = {
      name: 'apiKeyAuth',
      displayName: 'API Key',
      properties: [],
      authenticate: { type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } } },
    };
    applyCredentialAuthentication(original, credentialType, { apiKey: 'x' });
    expect(original.headers).toEqual({ keep: '1' });
  });
});
