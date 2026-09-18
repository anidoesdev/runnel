import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig — assistant memory', () => {
  it('is off by default, with the default budget and relevance floor', () => {
    expect(loadConfig({}).memory).toEqual({ capture: false, recall: false, tokenBudget: 400, minScore: 1 });
  });

  it('turns each flag on only for the exact string "true"', () => {
    expect(loadConfig({ RUNNEL_MEMORY_CAPTURE: 'true', RUNNEL_MEMORY_RECALL: 'true' }).memory).toMatchObject({ capture: true, recall: true });
    expect(loadConfig({ RUNNEL_MEMORY_CAPTURE: '1', RUNNEL_MEMORY_RECALL: 'yes' }).memory).toMatchObject({ capture: false, recall: false });
  });

  it('treats empty values as unset — what docker compose passes for `${VAR:-}`', () => {
    expect(loadConfig({ RUNNEL_MEMORY_TOKEN_BUDGET: '', RUNNEL_MEMORY_MIN_SCORE: '' }).memory).toMatchObject({ tokenBudget: 400, minScore: 1 });
  });

  it('accepts valid numbers and falls back on invalid ones', () => {
    expect(loadConfig({ RUNNEL_MEMORY_TOKEN_BUDGET: '800', RUNNEL_MEMORY_MIN_SCORE: '2.5' }).memory).toMatchObject({ tokenBudget: 800, minScore: 2.5 });
    expect(loadConfig({ RUNNEL_MEMORY_TOKEN_BUDGET: 'lots', RUNNEL_MEMORY_MIN_SCORE: '-3' }).memory).toMatchObject({ tokenBudget: 400, minScore: 1 });
    expect(loadConfig({ RUNNEL_MEMORY_MIN_SCORE: '0' }).memory.minScore).toBe(0);
  });
});

describe('loadConfig — database and secrets', () => {
  it('defaults to SQLite at runnel.sqlite, and flags the insecure dev secrets', () => {
    const config = loadConfig({});
    expect(config.db).toEqual({ type: 'sqlite', database: 'runnel.sqlite' });
    expect(config.usingDevDefaults).toEqual({ encryptionKey: true, jwtSecret: true });
  });

  it('reads the Runnel-named secrets', () => {
    const config = loadConfig({ RUNNEL_ENCRYPTION_KEY: 'k', RUNNEL_JWT_SECRET: 's' });
    expect(config.encryptionKey).toBe('k');
    expect(config.usingDevDefaults).toEqual({ encryptionKey: false, jwtSecret: false });
  });
});
