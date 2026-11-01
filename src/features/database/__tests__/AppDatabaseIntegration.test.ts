// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import App from '@/App.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { useCurrentUser } from '@/features/auth/use-current-user';

vi.mock('pouchdb/dist/pouchdb.js', () => ({
  default: class FakePouchDB {
    constructor() {}
  },
}));

vi.mock('@/core/db/pouch-adapter', async () => {
  const { createMemoryAdapter } = await import('@/core/db/memory-adapter');
  return { createPouchAdapter: async () => createMemoryAdapter() };
});

const mounted: VueWrapper[] = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  vi.clearAllMocks();
});

function mountApp(): VueWrapper {
  const { setUser } = useCurrentUser();
  setUser(
    {
      _id: 'user:admin',
      docType: 'user',
      branchId: '*',
      username: 'admin',
      displayName: 'Quản trị viên',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '',
      updatedAt: '',
    },
    'hq',
  );

  const wrapper = mount(App, {
    global: {
      plugins: [i18n, vuetifyLocale],
      stubs: {
        PosTerminal: true,
        KitchenDisplay: true,
        TypeDesigner: true,
        CatalogAdmin: true,
      },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('App Database Integration', () => {
  it('renders database status button and opens modal when clicked', async () => {
    const wrapper = mountApp();
    await flushPromises();

    const dbBtn = wrapper.find('[data-test="database-settings-btn"]');
    expect(dbBtn.exists()).toBe(true);

    await dbBtn.trigger('click');
    await flushPromises();

    expect(wrapper.findComponent({ name: 'DatabaseSettingsModal' }).exists()).toBe(true);
  });
});
