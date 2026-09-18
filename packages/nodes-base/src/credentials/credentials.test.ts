import { describe, expect, it } from 'vitest';
import { httpBasicAuth } from './HttpBasicAuth.credentials.js';
import { httpHeaderAuth } from './HttpHeaderAuth.credentials.js';
import { httpQueryAuth } from './HttpQueryAuth.credentials.js';
import { httpBearerAuth } from './HttpBearerAuth.credentials.js';
import { oAuth2Api } from './OAuth2Api.credentials.js';
import { postgresApi } from './PostgresApi.credentials.js';
import { openAiApi } from './OpenAiApi.credentials.js';
import type { ICredentialType } from '@runnel/workflow';

const allTypes: ICredentialType[] = [httpBasicAuth, httpHeaderAuth, httpQueryAuth, httpBearerAuth, oAuth2Api, postgresApi, openAiApi];

describe('built-in credential types', () => {
  it('each has a unique name, a display name, and at least one property', () => {
    const names = new Set<string>();
    for (const type of allTypes) {
      expect(type.name.length).toBeGreaterThan(0);
      expect(type.displayName.length).toBeGreaterThan(0);
      expect(type.properties.length).toBeGreaterThan(0);
      expect(names.has(type.name)).toBe(false);
      names.add(type.name);
    }
  });

  it('password-like fields are marked typeOptions.password', () => {
    const passwordField = httpBasicAuth.properties.find((p) => p.name === 'password')!;
    expect(passwordField.typeOptions?.password).toBe(true);
  });

  it('httpBearerAuth declares a declarative authenticate block referencing its own field', () => {
    expect(httpBearerAuth.authenticate?.properties.headers?.Authorization).toContain('$credentials.token');
  });

  it('httpBasicAuth/httpHeaderAuth/httpQueryAuth deliberately have no authenticate block (node-side special-casing)', () => {
    expect(httpBasicAuth.authenticate).toBeUndefined();
    expect(httpHeaderAuth.authenticate).toBeUndefined();
    expect(httpQueryAuth.authenticate).toBeUndefined();
  });

  it('oAuth2Api declares the standard OAuth2 field set', () => {
    const names = oAuth2Api.properties.map((p) => p.name);
    expect(names).toEqual(['clientId', 'clientSecret', 'authUrl', 'accessTokenUrl', 'scope']);
  });

  it('postgresApi has no authenticate/test block — the Postgres node connects with its fields directly', () => {
    expect(postgresApi.authenticate).toBeUndefined();
    expect(postgresApi.test).toBeUndefined();
    expect(postgresApi.properties.map((p) => p.name)).toEqual(['host', 'port', 'database', 'user', 'password', 'ssl']);
  });

  it('openAiApi has no authenticate block — the chat model node builds the Authorization header itself so it can also read baseUrl', () => {
    expect(openAiApi.authenticate).toBeUndefined();
    expect(openAiApi.properties.map((p) => p.name)).toEqual(['apiKey', 'baseUrl']);
    expect(openAiApi.properties.find((p) => p.name === 'apiKey')?.typeOptions?.password).toBe(true);
  });
});
