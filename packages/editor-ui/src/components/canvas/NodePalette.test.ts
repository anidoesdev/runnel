import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import NodePalette from './NodePalette.vue';
import { useNodeTypesStore } from '../../stores/nodeTypes.store.js';
import type { INodeTypeDescription } from '@runnel/workflow';

function nodeType(overrides: Partial<INodeTypeDescription> = {}): INodeTypeDescription {
  return {
    name: 'httpRequest',
    displayName: 'HTTP Request',
    description: 'Call an HTTP endpoint',
    group: ['transform'],
    version: 1,
    defaults: { name: 'HTTP Request' },
    inputs: ['main'],
    outputs: ['main'],
    properties: [],
    ...overrides,
  } as INodeTypeDescription;
}

function mountPalette(types: INodeTypeDescription[] = [nodeType()]) {
  const wrapper = mount(NodePalette);
  useNodeTypesStore().nodeTypes = types;
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('NodePalette', () => {
  /**
   * Touch devices never fire `dragstart`, so the tap path is the only way to add a node on a
   * phone - it has to emit, not silently do nothing.
   */
  it('emits add with the node type when a row is tapped', async () => {
    const wrapper = mountPalette();
    await wrapper.vm.$nextTick();

    await wrapper.find('.node-palette__item').trigger('click');

    expect(wrapper.emitted('add')).toEqual([['httpRequest']]);
  });

  it('emits add from the keyboard, so the row is reachable without a pointer', async () => {
    const wrapper = mountPalette();
    await wrapper.vm.$nextTick();

    await wrapper.find('.node-palette__item').trigger('keydown.enter');

    expect(wrapper.emitted('add')).toEqual([['httpRequest']]);
  });

  it('still carries the node type on a desktop drag', async () => {
    const wrapper = mountPalette();
    await wrapper.vm.$nextTick();
    const setData = vi.fn();

    await wrapper.find('.node-palette__item').trigger('dragstart', { dataTransfer: { setData, effectAllowed: '' } });

    expect(setData).toHaveBeenCalledWith('application/runnel-node-type', 'httpRequest');
  });
});
