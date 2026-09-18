import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TopbarActions from './TopbarActions.vue';
import { notificationsApi } from '../../api/notifications.js';
import type { INotificationRecord } from '../../api/types.js';

vi.mock('../../api/notifications.js', () => ({
  notificationsApi: { feed: vi.fn(), markAllRead: vi.fn(), clear: vi.fn() },
}));

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

function notification(overrides: Partial<INotificationRecord> = {}): INotificationRecord {
  return {
    id: 'n1',
    type: 'execution_failed',
    workflowId: 'wf-1',
    workflowName: 'Nightly sync',
    executionId: 'ex-1',
    message: 'Execution failed: boom',
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };
}

const globalStubs = { RouterLink: { template: '<a><slot /></a>' } };

async function mountBell(items: INotificationRecord[], unreadCount = items.filter((i) => !i.readAt).length) {
  vi.mocked(notificationsApi.feed).mockResolvedValue({ items, unreadCount });
  const wrapper = mount(TopbarActions, { global: { stubs: globalStubs } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('TopbarActions — notifications bell', () => {
  it('shows an unread badge and lists notifications when opened', async () => {
    const wrapper = await mountBell([notification(), notification({ id: 'n2', type: 'workflow_activated', message: 'Workflow activated' })]);

    expect(wrapper.find('.topbar-bell__badge').text()).toBe('2');

    await wrapper.find('.topbar-bell button').trigger('click');
    await flushPromises();

    const items = wrapper.findAll('.topbar-bell__item');
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain('Nightly sync');
    expect(items[0]!.text()).toContain('Execution failed: boom');
  });

  it('caps the badge at 9+', async () => {
    const many = Array.from({ length: 12 }, (_, i) => notification({ id: `n${i}` }));
    const wrapper = await mountBell(many);
    expect(wrapper.find('.topbar-bell__badge').text()).toBe('9+');
  });

  it('shows no badge when everything is read', async () => {
    const wrapper = await mountBell([notification({ readAt: new Date().toISOString() })], 0);
    expect(wrapper.find('.topbar-bell__badge').exists()).toBe(false);
  });

  it('marks everything read when the panel is opened, and clears the badge', async () => {
    const wrapper = await mountBell([notification()]);

    await wrapper.find('.topbar-bell button').trigger('click');
    await flushPromises();

    expect(notificationsApi.markAllRead).toHaveBeenCalledOnce();
    expect(wrapper.find('.topbar-bell__badge').exists()).toBe(false);
  });

  it('opens the workflow a notification points at', async () => {
    const wrapper = await mountBell([notification()]);
    await wrapper.find('.topbar-bell button').trigger('click');
    await flushPromises();

    await wrapper.find('.topbar-bell__item').trigger('click');

    expect(push).toHaveBeenCalledWith({ name: 'workflow-edit', params: { id: 'wf-1' } });
  });

  it('explains itself when there is nothing to show', async () => {
    const wrapper = await mountBell([]);
    await wrapper.find('.topbar-bell button').trigger('click');
    await flushPromises();

    expect(wrapper.find('.topbar-bell__empty').text()).toContain('Failed runs and activation changes');
    expect(notificationsApi.markAllRead).not.toHaveBeenCalled();
  });

  it('survives a failing poll without breaking the page it sits on', async () => {
    vi.mocked(notificationsApi.feed).mockRejectedValue(new Error('offline'));

    const wrapper = mount(TopbarActions, { global: { stubs: globalStubs } });
    await flushPromises();

    expect(wrapper.find('.topbar-bell').exists()).toBe(true);
    expect(wrapper.find('.topbar-bell__badge').exists()).toBe(false);
  });
});
