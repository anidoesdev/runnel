import { defineStore } from 'pinia';
import { authApi } from '../api/auth.js';
import type { IMeResponse } from '../api/types.js';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as IMeResponse | null,
    setupCompleted: null as boolean | null,
    /** True once fetchCurrentUser has resolved at least once — lets the router guard tell "still checking" from "definitely logged out". */
    initialized: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
  },
  actions: {
    async checkSetupStatus(): Promise<boolean> {
      const { completed } = await authApi.setupStatus();
      this.setupCompleted = completed;
      return completed;
    },
    async fetchCurrentUser(): Promise<boolean> {
      try {
        this.user = await authApi.me();
        return true;
      } catch {
        this.user = null;
        return false;
      } finally {
        this.initialized = true;
      }
    },
    async setup(email: string, password: string): Promise<void> {
      await authApi.setup(email, password);
      this.setupCompleted = true;
      await this.fetchCurrentUser();
    },
    async login(email: string, password: string): Promise<void> {
      await authApi.login(email, password);
      await this.fetchCurrentUser();
    },
    async logout(): Promise<void> {
      await authApi.logout();
      this.user = null;
    },
  },
});
