import { defineStore } from 'pinia';
import { credentialTypesApi, nodeTypesApi } from '../api/nodeTypes.js';
import type { ICredentialType, INodeTypeDescription } from '@n8n-clone/workflow';

export const useNodeTypesStore = defineStore('nodeTypes', {
  state: () => ({
    nodeTypes: [] as INodeTypeDescription[],
    credentialTypes: [] as ICredentialType[],
    loaded: false,
  }),
  getters: {
    byName: (state) => (name: string): INodeTypeDescription | undefined => state.nodeTypes.find((n) => n.name === name),
    credentialTypeByName:
      (state) =>
      (name: string): ICredentialType | undefined =>
        state.credentialTypes.find((c) => c.name === name),
  },
  actions: {
    async load(): Promise<void> {
      if (this.loaded) return;
      const [nodeTypes, credentialTypes] = await Promise.all([nodeTypesApi.list(), credentialTypesApi.list()]);
      this.nodeTypes = nodeTypes;
      this.credentialTypes = credentialTypes;
      this.loaded = true;
    },
  },
});
