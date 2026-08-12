import { defineStore } from 'pinia';
import { workflowsApi } from '../api/workflows.js';
import type { IConnections, IDataObject, INode } from '@n8n-clone/workflow';
import type { IExecuteWorkflowResult, IWorkflowRecord } from '../api/types.js';

/** Holds the workflow currently open in the editor — the canvas, the NDV, and the top bar all read/write this. */
export const useWorkflowStore = defineStore('workflow', {
  state: () => ({
    id: null as string | null,
    name: 'My workflow',
    active: false,
    nodes: [] as INode[],
    connections: {} as IConnections,
    dirty: false,
    saving: false,
    executing: false,
    lastResult: null as IExecuteWorkflowResult | null,
    error: null as string | null,
  }),
  actions: {
    reset(): void {
      this.id = null;
      this.name = 'My workflow';
      this.active = false;
      this.nodes = [];
      this.connections = {};
      this.dirty = false;
      this.lastResult = null;
      this.error = null;
    },

    async load(id: string): Promise<void> {
      const record = await workflowsApi.get(id);
      this.applyRecord(record);
    },

    applyRecord(record: IWorkflowRecord): void {
      this.id = record.id;
      this.name = record.name;
      this.active = record.active;
      this.nodes = record.nodes;
      this.connections = record.connections;
      this.dirty = false;
    },

    uniqueNodeName(base: string): string {
      const existing = new Set(this.nodes.map((n) => n.name));
      if (!existing.has(base)) return base;
      let suffix = 2;
      while (existing.has(`${base} ${suffix}`)) suffix += 1;
      return `${base} ${suffix}`;
    },

    addNode(nodeType: string, displayName: string, position: [number, number]): INode {
      const node: INode = {
        id: crypto.randomUUID(),
        name: this.uniqueNodeName(displayName),
        type: nodeType,
        typeVersion: 1,
        position,
        parameters: {},
      };
      this.nodes.push(node);
      this.dirty = true;
      return node;
    },

    moveNode(nodeId: string, position: [number, number]): void {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.position = position;
      this.dirty = true;
    },

    removeNode(nodeId: string): void {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      this.nodes = this.nodes.filter((n) => n.id !== nodeId);
      delete this.connections[node.name];
      for (const entry of Object.values(this.connections)) {
        entry.main = entry.main.map((branch) => branch.filter((c) => c.node !== node.name));
      }
      this.dirty = true;
    },

    updateNodeParameters(nodeId: string, parameters: IDataObject): void {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      node.parameters = parameters;
      this.dirty = true;
    },

    setNodeCredential(nodeId: string, credentialTypeName: string, credential: { id: string; name: string } | null): void {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const next = { ...node.credentials };
      if (credential) next[credentialTypeName] = credential;
      else delete next[credentialTypeName];
      node.credentials = next;
      this.dirty = true;
    },

    renameNode(nodeId: string, name: string): void {
      const node = this.nodes.find((n) => n.id === nodeId);
      if (!node || !name || node.name === name) return;
      const oldName = node.name;
      node.name = name;
      if (this.connections[oldName]) {
        this.connections[name] = this.connections[oldName]!;
        delete this.connections[oldName];
      }
      for (const entry of Object.values(this.connections)) {
        entry.main = entry.main.map((branch) => branch.map((c) => (c.node === oldName ? { ...c, node: name } : c)));
      }
      this.dirty = true;
    },

    addConnection(sourceName: string, targetName: string, sourceOutputIndex = 0, targetInputIndex = 0): void {
      const entry = (this.connections[sourceName] ??= { main: [] });
      while (entry.main.length <= sourceOutputIndex) entry.main.push([]);
      const branch = entry.main[sourceOutputIndex]!;
      if (branch.some((c) => c.node === targetName && c.index === targetInputIndex)) return;
      branch.push({ node: targetName, type: 'main', index: targetInputIndex });
      this.dirty = true;
    },

    removeConnection(sourceName: string, targetName: string, sourceOutputIndex: number, targetInputIndex: number): void {
      const branch = this.connections[sourceName]?.main[sourceOutputIndex];
      if (!branch) return;
      this.connections[sourceName]!.main[sourceOutputIndex] = branch.filter(
        (c) => !(c.node === targetName && c.index === targetInputIndex),
      );
      this.dirty = true;
    },

    async save(): Promise<void> {
      this.saving = true;
      this.error = null;
      try {
        const payload = { name: this.name, nodes: this.nodes, connections: this.connections };
        const record = this.id ? await workflowsApi.update(this.id, payload) : await workflowsApi.create(payload);
        this.applyRecord(record);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        this.saving = false;
      }
    },

    async setActive(active: boolean): Promise<void> {
      if (!this.id) throw new Error('Save the workflow before activating it');
      const record = await workflowsApi.update(this.id, { active });
      this.applyRecord(record);
    },

    async execute(): Promise<void> {
      if (!this.id) throw new Error('Save the workflow before running it');
      this.executing = true;
      this.error = null;
      try {
        this.lastResult = await workflowsApi.execute(this.id);
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        this.executing = false;
      }
    },
  },
});
