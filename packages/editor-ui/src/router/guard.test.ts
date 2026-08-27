import { describe, expect, it, vi } from 'vitest';
import { resolveNavigation } from './guard.js';
import type { IAuthGuardStore } from './guard.js';

function makeAuth(overrides: Partial<IAuthGuardStore> = {}): IAuthGuardStore {
  return {
    setupCompleted: null,
    isAuthenticated: false,
    initialized: false,
    checkSetupStatus: vi.fn(),
    fetchCurrentUser: vi.fn(),
    ...overrides,
  };
}

describe('resolveNavigation', () => {
  it('checks setup status when unknown, and redirects to setup when incomplete', async () => {
    const checkSetupStatus = vi.fn().mockImplementation(async function (this: IAuthGuardStore) {
      this.setupCompleted = false;
      return false;
    });
    const auth = makeAuth({ checkSetupStatus });

    const result = await resolveNavigation({ name: 'workflows' }, auth);
    expect(checkSetupStatus).toHaveBeenCalled();
    expect(result).toEqual({ name: 'setup' });
  });

  it('allows the setup route through while setup is incomplete', async () => {
    const auth = makeAuth({ setupCompleted: false });
    expect(await resolveNavigation({ name: 'setup' }, auth)).toBe(true);
  });

  it('redirects away from /setup once setup is already complete', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: false });
    expect(await resolveNavigation({ name: 'setup' }, auth)).toEqual({ name: 'workflows' });
  });

  it('fetches the current user when not yet initialized', async () => {
    const fetchCurrentUser = vi.fn().mockResolvedValue(true);
    const auth = makeAuth({ setupCompleted: true, initialized: false, fetchCurrentUser });

    await resolveNavigation({ name: 'workflows' }, auth);
    expect(fetchCurrentUser).toHaveBeenCalled();
  });

  it('sends an authenticated user away from /login to the workflow list', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: true });
    expect(await resolveNavigation({ name: 'login' }, auth)).toEqual({ name: 'workflows' });
  });

  it('lets an unauthenticated visitor reach /login', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: false });
    expect(await resolveNavigation({ name: 'login' }, auth)).toBe(true);
  });

  it('redirects an unauthenticated visitor away from a protected route to /login', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: false });
    expect(await resolveNavigation({ name: 'workflow-edit' }, auth)).toEqual({ name: 'login' });
  });

  it('lets an authenticated visitor reach a protected route', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: true });
    expect(await resolveNavigation({ name: 'workflows' }, auth)).toBe(true);
  });

  it('allows the landing page through even while setup is incomplete, unlike every other route', async () => {
    const auth = makeAuth({ setupCompleted: false });
    expect(await resolveNavigation({ name: 'landing' }, auth)).toBe(true);
  });

  it('lets an unauthenticated visitor see the landing page', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: false });
    expect(await resolveNavigation({ name: 'landing' }, auth)).toBe(true);
  });

  it('sends an already-authenticated visitor from the landing page straight to their workflows', async () => {
    const auth = makeAuth({ setupCompleted: true, initialized: true, isAuthenticated: true });
    expect(await resolveNavigation({ name: 'landing' }, auth)).toEqual({ name: 'workflows' });
  });
});
