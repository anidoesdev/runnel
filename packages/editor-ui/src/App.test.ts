import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import App from './App.vue';

describe('App', () => {
  it('boots and renders the placeholder shell', () => {
    const wrapper = mount(App);
    expect(wrapper.text()).toContain('n8n-clone editor');
    expect(wrapper.text()).toContain('OK');
  });
});
