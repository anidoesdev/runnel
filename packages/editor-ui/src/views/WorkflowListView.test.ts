import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import WorkflowListView from './WorkflowListView.vue';
import { foldersApi } from '../api/folders.js';
import { workflowsApi } from '../api/workflows.js';
import type { IFolderRecord, IWorkflowRecord } from '../api/types.js';

vi.mock('../api/workflows.js', () => ({
  workflowsApi: { list: vi.fn(), update: vi.fn(), remove: vi.fn(), restore: vi.fn(), removePermanently: vi.fn(), create: vi.fn() },
}));
vi.mock('../api/folders.js', () => ({
  foldersApi: { list: vi.fn(), create: vi.fn(), rename: vi.fn(), remove: vi.fn() },
}));

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));

// The bell does its own network calls; this view's tests are not about it.
vi.mock('../components/app/TopbarActions.vue', () => ({ default: { template: '<div />' } }));

function workflow(overrides: Partial<IWorkflowRecord> = {}): IWorkflowRecord {
  return {
    id: 'wf-1',
    name: 'Nightly sync',
    active: false,
    nodes: [],
    connections: {},
    settings: null,
    staticData: null,
    pinData: null,
    starred: false,
    deletedAt: null,
    folderId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const folder: IFolderRecord = { id: 'f1', name: 'API Integrations', createdAt: '', updatedAt: '' };

async function mountView(workflows: IWorkflowRecord[] = [workflow()], folders: IFolderRecord[] = []) {
  vi.mocked(workflowsApi.list).mockResolvedValue(workflows);
  vi.mocked(foldersApi.list).mockResolvedValue(folders);
  const wrapper = mount(WorkflowListView, { global: { stubs: { RouterLink: { template: '<a><slot /></a>' }, N8nButton: { template: '<button><slot /></button>' } } } });
  await flushPromises();
  return wrapper;
}

function navItem(wrapper: Awaited<ReturnType<typeof mountView>>, label: string) {
  return wrapper.findAll('.workflow-library__nav-item').find((item) => item.text().includes(label))!;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe('library views', () => {
  it('asks the server for starred workflows when Starred is selected', async () => {
    const wrapper = await mountView();

    await navItem(wrapper, 'Starred').trigger('click');
    await flushPromises();

    expect(workflowsApi.list).toHaveBeenLastCalledWith({ view: 'starred' });
  });

  it('asks for the trash, and offers restore and permanent delete instead of opening', async () => {
    const wrapper = await mountView();
    vi.mocked(workflowsApi.list).mockResolvedValue([workflow({ deletedAt: new Date().toISOString() })]);

    await navItem(wrapper, 'Trash').trigger('click');
    await flushPromises();

    expect(workflowsApi.list).toHaveBeenLastCalledWith({ view: 'trash' });
    expect(wrapper.text()).toContain('30 days left');

    // A trashed card doesn't open the editor.
    await wrapper.find('.workflow-card').trigger('click');
    expect(push).not.toHaveBeenCalled();

    await wrapper.findAll('.workflow-card__trash-action')[0]!.trigger('click');
    expect(workflowsApi.restore).toHaveBeenCalledWith('wf-1');
  });

  it('deleting from the card menu moves the workflow to the trash', async () => {
    const wrapper = await mountView();

    await wrapper.find('.workflow-card__menu-wrap .icon-button').trigger('click');
    const menuItem = wrapper.findAll('.workflow-card__menu-item').find((item) => item.text().includes('Move to trash'))!;
    await menuItem.trigger('click');

    expect(workflowsApi.remove).toHaveBeenCalledWith('wf-1');
  });

  it('stars a workflow from the card', async () => {
    const wrapper = await mountView();

    await wrapper.find('.workflow-card__star').trigger('click');

    expect(workflowsApi.update).toHaveBeenCalledWith('wf-1', { starred: true });
  });
});

describe('folders', () => {
  it('lists folders, filters by the selected one, and counts members', async () => {
    const wrapper = await mountView([workflow({ folderId: 'f1' })], [folder]);

    expect(wrapper.find('.workflow-library__folder-count').text()).toBe('1');

    await wrapper.find('.workflow-library__nav-item--folder').trigger('click');
    await flushPromises();

    expect(workflowsApi.list).toHaveBeenLastCalledWith({ view: 'all', folderId: 'f1' });
  });

  it('moves a workflow into a folder from the card menu', async () => {
    const wrapper = await mountView([workflow()], [folder]);

    await wrapper.find('.workflow-card__menu-wrap .icon-button').trigger('click');
    const target = wrapper.findAll('.workflow-card__menu-item').find((item) => item.text().includes('API Integrations'))!;
    await target.trigger('click');

    expect(workflowsApi.update).toHaveBeenCalledWith('wf-1', { folderId: 'f1' });
  });

  it('creates a folder from the sidebar', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Data Pipelines');
    vi.mocked(foldersApi.create).mockResolvedValue({ ...folder, id: 'f2', name: 'Data Pipelines' });
    const wrapper = await mountView();

    await wrapper.find('.workflow-library__nav-add').trigger('click');

    expect(foldersApi.create).toHaveBeenCalledWith('Data Pipelines');
  });

  it('does not create a folder when the prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const wrapper = await mountView();

    await wrapper.find('.workflow-library__nav-add').trigger('click');

    expect(foldersApi.create).not.toHaveBeenCalled();
  });
});

describe('templates', () => {
  it('shows the starter templates and creates a real workflow from one', async () => {
    vi.mocked(workflowsApi.create).mockResolvedValue(workflow({ id: 'wf-new' }));
    const wrapper = await mountView();

    const templatesTab = wrapper.findAll('.workflow-library__tab').find((tab) => tab.text() === 'Templates')!;
    await templatesTab.trigger('click');

    const cards = wrapper.findAll('.template-card');
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0]!.text()).toContain('Scheduled API sync');

    await cards[0]!.find('button').trigger('click');
    await flushPromises();

    const payload = vi.mocked(workflowsApi.create).mock.calls[0]![0];
    expect(payload.name).toBe('Scheduled API sync');
    expect(payload.nodes.map((node) => node.type)).toEqual(['scheduleTrigger', 'httpRequest', 'set']);
    expect(payload.connections['Schedule Trigger']).toEqual({ main: [[{ node: 'HTTP Request', type: 'main', index: 0 }]] });
    expect(push).toHaveBeenCalledWith({ name: 'workflow-edit', params: { id: 'wf-new' } });
  });

  it('links Community and the footer out to the project on GitHub', async () => {
    const wrapper = await mountView();

    const community = wrapper.findAll('a.workflow-library__tab').find((tab) => tab.text().includes('Community'))!;
    expect(community.attributes('href')).toContain('/discussions');
    expect(community.attributes('rel')).toContain('noopener');

    const links = wrapper.findAll('.workflow-library__sidebar-footer a').map((link) => link.attributes('href'));
    expect(links).toEqual([expect.stringContaining('#readme'), expect.stringContaining('/issues')]);
  });
});
