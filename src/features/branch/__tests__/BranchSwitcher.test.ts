// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import BranchSwitcher from '../BranchSwitcher.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createBranchRepository, type BranchRepository } from '@/core/branch/branch-repository';
import { useCurrentUser } from '@/features/auth/use-current-user';
import { hashPin } from '@/core/auth/token';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import { createI18n } from 'vue-i18n';
import viMessages from '@/i18n/vi.json';

describe('BranchSwitcher.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;
  let repo: BranchRepository;

  beforeEach(async () => {
    localStorage.clear();
    const adapter = await createMemoryAdapter();
    repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { logout } = useCurrentUser();
    logout();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders static badge when cashier has single branch access', async () => {
    const { login } = useCurrentUser();
    await login(
      {
        _id: 'user:cashier',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'cashier',
        displayName: 'Thu ngân 1',
        pinHash: hashPin('1111'),
        role: 'cashier',
        branchIds: ['hq'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      '1111',
      'hq',
      'secret',
    );

    wrapper = mount(BranchSwitcher, {
      props: { branchRepo: repo },
      global: { plugins: [i18n] },
    });

    // Wait for async initialization
    await new Promise((r) => setTimeout(r, 20));

    expect(wrapper.find('[data-test="branch-badge"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-select"]').exists()).toBe(false);
  });

  it('renders select dropdown and admin settings button when owner logs in', async () => {
    const { login } = useCurrentUser();
    await login(
      {
        _id: 'user:admin',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'admin',
        displayName: 'Chủ chuỗi',
        pinHash: hashPin('8888'),
        role: 'owner',
        branchIds: ['hq', 'dist1'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      '8888',
      'hq',
      'secret',
    );

    wrapper = mount(BranchSwitcher, {
      props: { branchRepo: repo },
      global: { plugins: [i18n] },
    });

    await new Promise((r) => setTimeout(r, 20));

    expect(wrapper.find('[data-test="branch-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-admin-btn"]').exists()).toBe(true);
  });
});
