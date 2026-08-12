import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import NodeDetailPanel from './NodeDetailPanel.vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import { useWorkflowStore } from '../../stores/workflow.store.js';
import type { INodeTypeDescription } from '@n8n-clone/workflow';

/** A minimal stand-in for the real Set node's description: a "mode" select (default 'manual') gates a fixedCollection field. */
const setLikeDescription: INodeTypeDescription = {
  displayName: 'Edit Fields (Set)',
  name: 'set',
  group: ['transform'],
  version: 1,
  description: 'test',
  defaults: { name: 'Edit Fields' },
  inputs: ['main'],
  outputs: ['main'],
  properties: [
    {
      displayName: 'Mode',
      name: 'mode',
      type: 'options',
      default: 'manual',
      options: [
        { name: 'Manual Mapping', value: 'manual' },
        { name: 'JSON', value: 'json' },
      ],
    },
    {
      displayName: 'Fields to Set',
      name: 'fields',
      type: 'fixedCollection',
      default: {},
      typeOptions: { multipleValues: true },
      displayOptions: { show: { mode: ['manual'] } },
      options: [{ displayName: 'Name', name: 'name', type: 'string', default: '' }],
    },
  ],
};

describe('NodeDetailPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shows a property whose displayOptions depend on another property\'s default value, without the user touching anything', () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);
    expect(node.parameters).toEqual({});

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });

    expect(wrapper.text()).toContain('Fields to Set');
  });

  it('hides that property once the gating value is explicitly changed away from the default', async () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);
    workflowStore.updateNodeParameters(node.id, { mode: 'json' });

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    expect(wrapper.text()).not.toContain('Fields to Set');
  });
});
