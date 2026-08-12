import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import N8nCheckbox from './N8nCheckbox.vue';

describe('N8nCheckbox', () => {
  it('reflects modelValue and emits update:modelValue on toggle', async () => {
    const wrapper = mount(N8nCheckbox, { props: { modelValue: false, label: 'Active' } });
    expect((wrapper.find('input').element as HTMLInputElement).checked).toBe(false);
    expect(wrapper.text()).toBe('Active');

    await wrapper.find('input').setValue(true);
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
  });
});
