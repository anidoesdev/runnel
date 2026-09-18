import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RunnelModal from './RunnelModal.vue';

describe('RunnelModal', () => {
  it('renders nothing when closed', () => {
    const wrapper = mount(RunnelModal, { props: { modelValue: false, title: 'Test' } });
    expect(wrapper.find('.runnel-modal').exists()).toBe(false);
  });

  it('renders the title and slot content when open', () => {
    const wrapper = mount(RunnelModal, {
      props: { modelValue: true, title: 'My Modal' },
      slots: { default: 'body content' },
    });
    expect(wrapper.text()).toContain('My Modal');
    expect(wrapper.text()).toContain('body content');
  });

  it('emits update:modelValue(false) when the close button is clicked', async () => {
    const wrapper = mount(RunnelModal, { props: { modelValue: true, title: 'My Modal' } });
    await wrapper.find('.runnel-modal__close').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false]);
  });
});
