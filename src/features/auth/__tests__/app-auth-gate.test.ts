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
  return {
    createPouchAdapter: async () => {
      const { createMemoryAdapter } = await import('@/core/db/memory-adapter');
      const { createSystemRepository } = await import('@/core/system/system-repository');
      const { createUserRepository } = await import('@/core/auth/user-repository');
      const adapter = await createMemoryAdapter();

      const sysRepo = createSystemRepository(adapter);
      await sysRepo.initializeSystem({
        storeName: 'Test Store',
        primaryBranchId: 'hq',
        authProviderMode: 'both',
      });

      const userRepo = createUserRepository(adapter);
      await userRepo.createUser({
        username: 'admin',
        displayName: 'Quản trị viên (Chủ quán)',
        password: 'AdminPassword123!',
        pin: '1234',
        role: 'owner',
        branchIds: ['hq', 'dist1'],
      });

      return adapter;
    },
  };
});

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  vi.clearAllMocks();
});

describe('App.vue Auth Gate & User Profile Menu', () => {
  beforeEach(() => {
    const { logout } = useCurrentUser();
    logout();
  });

  it('blocks access to app views when user is not authenticated and renders login gate', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [i18n, vuetifyLocale],
        stubs: {
          TypeDesigner: true,
          CatalogAdmin: true,
          PosTerminal: true,
          KitchenDisplay: true,
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    // App main content is NOT accessible
    expect(wrapper.find('main.app').exists()).toBe(false);
    expect(wrapper.find('[data-view="pos"]').exists()).toBe(false);

    // Login Gate is rendered and cannot be cancelled (no cancel button)
    expect(wrapper.find('[data-test="user-login-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="close-login-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="login-cancel-btn"]').exists()).toBe(false);
  });

  it('renders main app when authenticated, toggles profile menu on click, and logs out to gate', async () => {
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

    const wrapper = mount(App, {
      global: {
        plugins: [i18n, vuetifyLocale],
        stubs: {
          TypeDesigner: true,
          CatalogAdmin: true,
          PosTerminal: true,
          KitchenDisplay: true,
        },
      },
    });
    mounted.push(wrapper);
    await flushPromises();

    // 1. Authenticated user can see main app and views
    expect(wrapper.find('main.app').exists()).toBe(true);
    expect(wrapper.find('[data-view="pos"]').exists()).toBe(true);

    // 2. Click user profile button opens UserProfileMenu
    const profileBtn = wrapper.find('[data-test="user-profile-btn"]');
    expect(profileBtn.exists()).toBe(true);
    expect(wrapper.find('[data-test="user-profile-menu"]').exists()).toBe(false);

    await profileBtn.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-test="user-profile-menu"]').exists()).toBe(true);

    // 3. Click Logout button inside UserProfileMenu
    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    expect(logoutBtn.exists()).toBe(true);

    await logoutBtn.trigger('click');
    await flushPromises();

    // 4. User is redirected to login gate and main app is blocked
    expect(wrapper.find('main.app').exists()).toBe(false);
    expect(wrapper.find('[data-test="user-login-modal"]').exists()).toBe(true);
  });
});
