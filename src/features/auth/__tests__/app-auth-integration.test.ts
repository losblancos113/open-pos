// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { i18n, vuetifyLocale } from '@/i18n';
import App from '@/App.vue';
import { useCurrentUser } from '../use-current-user';

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

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  vi.clearAllMocks();
});

describe('App.vue Auth, Installer & Permissions Integration', () => {
  it('renders installer wizard on first run, allows owner to access user management, and hides for non-owner', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [i18n, vuetifyLocale],
        stubs: { TypeDesigner: true, CatalogAdmin: true, PosTerminal: true, KitchenDisplay: true },
      },
    });
    mounted.push(wrapper);

    await flushPromises();

    // 1. Check Installer Wizard is mounted on first run and no pre-existing admin is seeded
    const installer = wrapper.findComponent({ name: 'InstallerWizard' });
    expect(installer.exists()).toBe(true);
    const initialUsers = await (installer.props() as any).userRepo.listUsers({ includeInactive: true });
    expect(initialUsers).toHaveLength(0);

    // 2. Log in as owner (super admin)
    const { setUser } = useCurrentUser();
    setUser(
      {
        _id: 'user:admin',
        docType: 'user',
        branchId: '*',
        username: 'admin',
        displayName: 'Quản trị viên (Chủ quán)',
        role: 'owner',
        branchIds: ['hq', 'dist1'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      'hq',
    );
    await flushPromises();

    // 3. Check User Admin button is rendered for owner (super admin)
    const userAdminBtn = wrapper.find('[data-test="user-admin-btn"]');
    expect(userAdminBtn.exists()).toBe(true);

    // 4. User Admin modal is mounted and can be opened
    await userAdminBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="user-admin-modal"]').exists()).toBe(true);

    // 5. Switch current user to cashier and verify user-admin-btn is hidden
    setUser(
      {
        _id: 'user:cashier_temp',
        docType: 'user',
        branchId: '*',
        username: 'cashier_temp',
        displayName: 'Thu ngân Ca 1',
        role: 'cashier',
        branchIds: ['hq'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      'hq',
    );
    await flushPromises();

    // Cashier cannot access user management or cross-branch report
    expect(wrapper.find('[data-test="user-admin-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="cross-branch-report-btn"]').exists()).toBe(false);
  });
});
