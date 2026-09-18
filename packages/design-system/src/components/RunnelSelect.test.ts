import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import RunnelSelect from './RunnelSelect.vue';

const options = [
  { label: 'One', value: '1' },
  { label: 'Two', value: '2' },
];

describe('RunnelSelect', () => {
  it('renders an option per entry and emits update:modelValue on change', async () => {
    const wrapper = mount(RunnelSelect, { props: { modelValue: '1', options } });
    expect(wrapper.findAll('option')).toHaveLength(2);

    await wrapper.setValue('2');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2']);
  });
});
