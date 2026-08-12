import { defineStore } from 'pinia';
import { credentialsApi } from '../api/credentials.js';
import type { ICreateCredentialPayload } from '../api/credentials.js';
import type { ICredentialRecord } from '../api/types.js';

export const useCredentialsStore = defineStore('credentials', {
  state: () => ({
    credentials: [] as ICredentialRecord[],
    loaded: false,
  }),
  getters: {
    byType:
      (state) =>
      (type: string): ICredentialRecord[] =>
        state.credentials.filter((c) => c.type === type),
  },
  actions: {
    async load(force = false): Promise<void> {
      if (this.loaded && !force) return;
      this.credentials = await credentialsApi.list();
      this.loaded = true;
    },
    async create(payload: ICreateCredentialPayload): Promise<ICredentialRecord> {
      const created = await credentialsApi.create(payload);
      this.credentials.push(created);
      return created;
    },
    async remove(id: string): Promise<void> {
      await credentialsApi.remove(id);
      this.credentials = this.credentials.filter((c) => c.id !== id);
    },
  },
});
