import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RunnelButton from './RunnelButton.vue';

describe('RunnelButton', () => {
  it('renders slot content and emits click', async () => {
    const wrapper = mount(RunnelButton, { slots: { default: 'Save' } });

    expect(wrapper.text()).toBe('Save');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('respects the disabled prop', () => {
    const wrapper = mount(RunnelButton, { props: { disabled: true } });
    expect(wrapper.attributes('disabled')).toBeDefined();
  });
});
