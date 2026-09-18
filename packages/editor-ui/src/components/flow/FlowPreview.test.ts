import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FlowPreview from './FlowPreview.vue';
import type { IConnections } from '@runnel/workflow';

const nodes = [
  { name: 'Webhook', type: 'webhook', position: [0, 0] as [number, number] },
  { name: 'Filter', type: 'filter', position: [260, 0] as [number, number] },
  { name: 'Post', type: 'httpRequest', position: [520, 0] as [number, number] },
];
const connections: IConnections = {
  Webhook: { main: [[{ node: 'Filter', type: 'main', index: 0 }]] },
  Filter: { main: [[{ node: 'Post', type: 'main', index: 0 }]] },
};

describe('FlowPreview', () => {
  it('draws every node and connection', () => {
    const wrapper = mount(FlowPreview, { props: { nodes, connections } });
    expect(wrapper.findAll('.flow-preview__node')).toHaveLength(3);
    expect(wrapper.findAll('.flow-preview__edge')).toHaveLength(2);
    expect(wrapper.attributes('aria-label')).toBe('Workflow preview with 3 nodes');
  });

  it('animates a run: a pulse per connection, a glow and a done tick per node, all on one shared cycle', () => {
    const wrapper = mount(FlowPreview, { props: { nodes, connections } });
    expect(wrapper.findAll('.flow-preview__pulse')).toHaveLength(2);
    expect(wrapper.findAll('.flow-preview__node-glow')).toHaveLength(3);
    expect(wrapper.findAll('.flow-preview__done')).toHaveLength(3);
    const durations = new Set(wrapper.findAll('animate, animateMotion').map((el) => el.attributes('dur')));
    expect(durations.size).toBe(1);
  });

  it('lights nodes in execution order', () => {
    const wrapper = mount(FlowPreview, { props: { nodes, connections } });
    const glowStarts = wrapper.findAll('.flow-preview__node-glow animate').map((el) => Number(el.attributes('keyTimes')!.split(';')[1]));
    expect(glowStarts).toEqual([...glowStarts].sort((a, b) => a - b));
    expect(glowStarts[0]).toBe(0);
    expect(glowStarts[2]).toBeGreaterThan(glowStarts[1]!);
  });

  it('renders still, with no animation elements, when animation is off', () => {
    const wrapper = mount(FlowPreview, { props: { nodes, connections, animate: false } });
    expect(wrapper.findAll('animate, animateMotion')).toHaveLength(0);
    expect(wrapper.findAll('.flow-preview__node')).toHaveLength(3);
  });

  it('shows names and types in the hero variant only', () => {
    expect(mount(FlowPreview, { props: { nodes, connections, variant: 'hero' } }).text()).toContain('HTTP Request');
    expect(mount(FlowPreview, { props: { nodes, connections } }).find('.flow-preview__name').exists()).toBe(false);
  });

  it('says so for an empty workflow', () => {
    expect(mount(FlowPreview, { props: { nodes: [], connections: {} } }).text()).toContain('Empty workflow');
  });
});
