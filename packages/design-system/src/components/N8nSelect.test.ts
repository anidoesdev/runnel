import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import N8nSelect from './N8nSelect.vue';

const options = [
  { label: 'One', value: '1' },
  { label: 'Two', value: '2' },
];

describe('N8nSelect', () => {
  it('renders an option per entry and emits update:modelValue on change', async () => {
    const wrapper = mount(N8nSelect, { props: { modelValue: '1', options } });
    expect(wrapper.findAll('option')).toHaveLength(2);

    await wrapper.setValue('2');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2']);
  });
});
