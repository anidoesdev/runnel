import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import N8nInput from './N8nInput.vue';

describe('N8nInput', () => {
  it('renders the modelValue and emits update:modelValue on input', async () => {
    const wrapper = mount(N8nInput, { props: { modelValue: 'hello' } });
    expect((wrapper.element as HTMLInputElement).value).toBe('hello');

    await wrapper.setValue('world');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['world']);
  });

  it('respects the disabled prop', () => {
    const wrapper = mount(N8nInput, { props: { disabled: true } });
    expect(wrapper.attributes('disabled')).toBeDefined();
  });
});
