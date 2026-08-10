import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import N8nButton from './N8nButton.vue';

describe('N8nButton', () => {
  it('renders slot content and emits click', async () => {
    const wrapper = mount(N8nButton, { slots: { default: 'Save' } });

    expect(wrapper.text()).toBe('Save');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('respects the disabled prop', () => {
    const wrapper = mount(N8nButton, { props: { disabled: true } });
    expect(wrapper.attributes('disabled')).toBeDefined();
  });
});
