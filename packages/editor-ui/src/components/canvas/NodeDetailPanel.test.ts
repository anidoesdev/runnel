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

  it('shows an Input panel and an Output panel', () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    const headings = wrapper.findAll('h3').map((h) => h.text());
    expect(headings).toEqual(['Input', 'Output']);
  });

  it('marks a required property with an asterisk in the Input panel', () => {
    const requiredFieldDescription: INodeTypeDescription = {
      ...setLikeDescription,
      name: 'requiredFieldNode',
      properties: [{ displayName: 'URL', name: 'url', type: 'string', default: '', required: true }],
    };
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [requiredFieldDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('requiredFieldNode', 'Required Field Node', [0, 0]);

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    expect(wrapper.find('.property-field__required').exists()).toBe(true);
    expect(wrapper.text()).toContain('URL *');
  });

  it('shows a placeholder in the Output panel before the workflow has been executed', () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    expect(wrapper.text()).toContain("Run the workflow to see this node's output here.");
  });

  it("shows this node's output items after a successful execution", () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);
    workflowStore.lastResult = {
      executionId: 'e1',
      status: 'success',
      data: {
        resultData: {
          runData: {
            'Edit Fields': [
              {
                startTime: 0,
                executionTime: 1,
                executionStatus: 'success',
                source: [],
                data: { main: [[{ json: { greeting: 'hi Ada' } }]] },
              },
            ],
          },
        },
      },
    };

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    expect(wrapper.find('.ndv__output-status--success').exists()).toBe(true);
    expect(wrapper.text()).toContain('"greeting": "hi Ada"');
  });

  it("shows the error message when this node's last run failed", () => {
    const nodeTypesStore = useNodeTypesStore();
    nodeTypesStore.nodeTypes = [setLikeDescription];

    const workflowStore = useWorkflowStore();
    const node = workflowStore.addNode('set', 'Edit Fields', [0, 0]);
    workflowStore.lastResult = {
      executionId: 'e1',
      status: 'error',
      data: {
        resultData: {
          runData: {
            'Edit Fields': [
              {
                startTime: 0,
                executionTime: 1,
                executionStatus: 'error',
                source: [],
                error: { message: 'boom', node: 'Edit Fields', timestamp: 0 },
              },
            ],
          },
        },
      },
    };

    const wrapper = mount(NodeDetailPanel, { props: { nodeId: node.id } });
    expect(wrapper.find('.ndv__output-status--error').exists()).toBe(true);
    expect(wrapper.text()).toContain('boom');
  });
});
