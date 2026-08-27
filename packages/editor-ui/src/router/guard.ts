import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router';

/** The slice of the auth store the guard actually needs — kept narrow so it's testable without mounting Pinia. */
export interface IAuthGuardStore {
  setupCompleted: boolean | null;
  isAuthenticated: boolean;
  initialized: boolean;
  checkSetupStatus(): Promise<boolean>;
  fetchCurrentUser(): Promise<boolean>;
}

/**
 * Extracted from the router so it can be unit-tested directly, without mounting a real
 * vue-router instance. Order of decisions: setup status first (nothing else matters until
 * the owner account exists) — except the public landing page, which renders at every stage
 * and just funnels its own CTAs into login/setup rather than being redirected away from
 * itself. Then the setup/login routes are special-cased so a fully-authenticated user is
 * bounced away from them (the landing page gets the same treatment, sending a signed-in
 * visitor straight to their workflows), then every other route requires a session.
 */
export async function resolveNavigation(
  to: Pick<RouteLocationNormalized, 'name'>,
  auth: IAuthGuardStore,
): Promise<true | RouteLocationRaw> {
  if (auth.setupCompleted === null) {
    await auth.checkSetupStatus();
  }

  if (!auth.setupCompleted) {
    return to.name === 'setup' || to.name === 'landing' ? true : { name: 'setup' };
  }

  if (to.name === 'setup') {
    return { name: 'workflows' };
  }

  if (!auth.initialized) {
    await auth.fetchCurrentUser();
  }

  if (to.name === 'login' || to.name === 'landing') {
    return auth.isAuthenticated ? { name: 'workflows' } : true;
  }

  return auth.isAuthenticated ? true : { name: 'login' };
}
