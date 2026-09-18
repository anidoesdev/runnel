import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RunnelInput from './RunnelInput.vue';

describe('RunnelInput', () => {
  it('renders the modelValue and emits update:modelValue on input', async () => {
    const wrapper = mount(RunnelInput, { props: { modelValue: 'hello' } });
    expect((wrapper.element as HTMLInputElement).value).toBe('hello');

    await wrapper.setValue('world');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['world']);
  });

  it('respects the disabled prop', () => {
    const wrapper = mount(RunnelInput, { props: { disabled: true } });
    expect(wrapper.attributes('disabled')).toBeDefined();
  });
});
