import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SettingsView from './SettingsView.vue';
import { settingsApi } from '../api/settings.js';
import { ApiError } from '../api/http.js';
import type { ISystemInfo, IUserPreferences } from '../api/types.js';

vi.mock('../api/settings.js', () => ({
  settingsApi: { system: vi.fn(), preferences: vi.fn(), updatePreferences: vi.fn(), changePassword: vi.fn() },
}));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../components/app/TopbarActions.vue', () => ({ default: { template: '<div />' } }));

const SYSTEM: ISystemInfo = {
  version: '0.1.0',
  nodeVersion: 'v22.0.0',
  database: 'sqlite',
  customNodesDir: null,
  memory: { capture: true, recall: false, tokenBudget: 400 },
};

async function mountSettings(preferences: IUserPreferences = {}) {
  vi.mocked(settingsApi.system).mockResolvedValue(SYSTEM);
  vi.mocked(settingsApi.preferences).mockResolvedValue(preferences);
  const wrapper = mount(SettingsView, {
    global: {
      stubs: {
        RouterLink: { template: '<a><slot /></a>' },
        RunnelButton: { template: '<button><slot /></button>' },
        RunnelInput: {
          props: ['modelValue'],
          template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('system info', () => {
  it('reports what the server told it, including whether memory is on', async () => {
    const wrapper = await mountSettings();
    const text = wrapper.find('.settings-system').text();

    expect(text).toContain('v22.0.0');
    expect(text).toContain('sqlite');
    expect(text).toContain('none configured');
    expect(text).toContain('capture on');
    expect(text).toContain('recall off');
  });
});

describe('appearance', () => {
  it('switches the theme, marks the active option, and remembers it', async () => {
    const wrapper = await mountSettings();

    const dark = wrapper.findAll('.settings-theme__option').find((option) => option.text().includes('Dark'))!;
    await dark.trigger('click');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('runnel.theme')).toBe('dark');
    expect(dark.classes()).toContain('settings-theme__option--active');
  });
});

describe('assistant defaults', () => {
  it('loads the saved token budget and saves a new one', async () => {
    const wrapper = await mountSettings({ assistant: { tokenLimit: 50_000 } });
    const input = wrapper.find('.settings-form--inline input');
    expect((input.element as HTMLInputElement).value).toBe('50000');

    await input.setValue('120000');
    // RunnelButton renders a bare <button>, so it submits its form — same as the real page.
    await wrapper.find('.settings-form--inline').trigger('submit');
    await flushPromises();

    expect(settingsApi.updatePreferences).toHaveBeenCalledWith({ assistant: { tokenLimit: 120_000 } });
    expect(wrapper.find('.settings-card__ok').text()).toBe('Saved.');
  });

  it('rejects a budget below the allowed floor without calling the server', async () => {
    const wrapper = await mountSettings();

    await wrapper.find('.settings-form--inline input').setValue('10');
    await wrapper.find('.settings-form--inline').trigger('submit');
    await flushPromises();

    expect(settingsApi.updatePreferences).not.toHaveBeenCalled();
    expect(wrapper.find('.settings-card__error').text()).toContain('between 1,000 and 1,000,000');
  });
});

describe('changing the password', () => {
  async function fillPasswordForm(wrapper: Awaited<ReturnType<typeof mountSettings>>, current: string, next: string, confirm: string) {
    const inputs = wrapper.findAll('.settings-form input');
    await inputs[0]!.setValue(current);
    await inputs[1]!.setValue(next);
    await inputs[2]!.setValue(confirm);
    await wrapper.findAll('.settings-card')[0]!.find('form').trigger('submit');
    await flushPromises();
  }

  it('sends the change and confirms it', async () => {
    vi.mocked(settingsApi.changePassword).mockResolvedValue({ id: 'u1', email: 'owner@example.com' });
    const wrapper = await mountSettings();

    await fillPasswordForm(wrapper, 'correct-horse', 'battery-staple', 'battery-staple');

    expect(settingsApi.changePassword).toHaveBeenCalledWith('correct-horse', 'battery-staple');
    expect(wrapper.find('.settings-card__ok').text()).toBe('Password changed.');
  });

  it('catches a mismatch and a too-short password before calling the server', async () => {
    const wrapper = await mountSettings();

    await fillPasswordForm(wrapper, 'correct-horse', 'battery-staple', 'battery-stapleX');
    expect(settingsApi.changePassword).not.toHaveBeenCalled();
    expect(wrapper.find('.settings-card__error').text()).toContain('do not match');

    await fillPasswordForm(wrapper, 'correct-horse', 'short', 'short');
    expect(settingsApi.changePassword).not.toHaveBeenCalled();
    expect(wrapper.find('.settings-card__error').text()).toContain('at least 8 characters');
  });

  it('surfaces the server rejecting the current password', async () => {
    vi.mocked(settingsApi.changePassword).mockRejectedValue(new ApiError(401, 'Current password is incorrect'));
    const wrapper = await mountSettings();

    await fillPasswordForm(wrapper, 'wrong', 'battery-staple', 'battery-staple');

    expect(wrapper.find('.settings-card__error').text()).toBe('Current password is incorrect');
  });
});
