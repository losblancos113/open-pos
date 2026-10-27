// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import InstallerWizard from '../InstallerWizard.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createBranchRepository } from '@/core/branch/branch-repository';
import { createUserRepository } from '@/core/auth/user-repository';
import { createSystemRepository } from '@/core/system/system-repository';
import viMessages from '@/i18n/vi.json';
import enMessages from '@/i18n/en.json';

describe('InstallerWizard.vue', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'vi',
    messages: {
      vi: viMessages,
      en: enMessages,
    },
  });

  let adapter: any;
  let branchRepo: any;
  let userRepo: any;
  let systemRepo: any;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    branchRepo = createBranchRepository(adapter);
    userRepo = createUserRepository(adapter);
    systemRepo = createSystemRepository(adapter);
  });

  function factory(props = {}) {
    return mount(InstallerWizard, {
      props: {
        open: true,
        branchRepo,
        userRepo,
        systemRepo,
        ...props,
      },
      global: {
        plugins: [i18n],
      },
    });
  }

  it('renders Step 1 (Store & Branch) on initial mount', () => {
    const wrapper = factory();
    expect(wrapper.find('[data-test="installer-wizard"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="store-name-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-name-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-code-input"]').exists()).toBe(true);
  });

  it('navigates through steps and validates passwords on Step 2', async () => {
    const wrapper = factory();

    // Fill Step 1 and proceed
    await wrapper.find('[data-test="store-name-input"]').setValue('Quán Cà Phê Mẫu');
    await wrapper.find('[data-test="branch-name-input"]').setValue('Trụ sở chính');
    await wrapper.find('[data-test="branch-code-input"]').setValue('HQ');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Now on Step 2 (Super Admin Account)
    expect(wrapper.find('[data-test="admin-username-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="admin-password-input"]').exists()).toBe(true);

    // Try navigating with mismatched passwords
    await wrapper.find('[data-test="admin-password-input"]').setValue('Pass123456');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('DifferentPass');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    expect(wrapper.find('[data-test="step-error"]').text().toLowerCase()).toContain('mật khẩu');

    // Fix passwords and proceed to Step 3
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('Pass123456');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 3 (Auth mode)
    expect(wrapper.find('[data-test="auth-mode-both"]').exists()).toBe(true);
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 4 (Summary & Finish)
    expect(wrapper.find('[data-test="finish-setup-btn"]').exists()).toBe(true);
  });

  it('completes the setup process and emits complete event with user and branch', async () => {
    const wrapper = factory();

    // Step 1
    await wrapper.find('[data-test="store-name-input"]').setValue('Nhà Hàng Biển Xanh');
    await wrapper.find('[data-test="branch-name-input"]').setValue('Chi Nhánh 1');
    await wrapper.find('[data-test="branch-code-input"]').setValue('CN1');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 2
    await wrapper.find('[data-test="admin-username-input"]').setValue('superadmin');
    await wrapper.find('[data-test="admin-display-name-input"]').setValue('Chủ Hệ Thống');
    await wrapper.find('[data-test="admin-password-input"]').setValue('Admin@Secure2026');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('Admin@Secure2026');
    await wrapper.find('[data-test="admin-pin-input"]').setValue('1234');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 3
    await wrapper.find('[data-test="auth-mode-both"]').trigger('click');
    await wrapper.find('[data-test="logto-endpoint-input"]').setValue('https://mypos.logto.app');
    await wrapper.find('[data-test="logto-appid-input"]').setValue('client_pos_001');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 4: Finish
    await wrapper.find('[data-test="finish-setup-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('complete')).toBeTruthy();
    const [emittedUser, emittedBranchId] = wrapper.emitted('complete')![0] as [any, string];

    expect(emittedUser.username).toBe('superadmin');
    expect(emittedUser.role).toBe('owner');
    expect(emittedBranchId).toBe('cn1');

    // Verify database state
    const savedConfig = await systemRepo.getConfig();
    expect(savedConfig?.isInitialized).toBe(true);
    expect(savedConfig?.storeName).toBe('Nhà Hàng Biển Xanh');
    expect(savedConfig?.authProviderMode).toBe('both');
    expect(savedConfig?.logtoConfig?.endpoint).toBe('https://mypos.logto.app');

    const owners = await userRepo.countOwners();
    expect(owners).toBe(1);
  });
});
