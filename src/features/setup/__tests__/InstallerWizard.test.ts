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
        portServiceOptions: {
          checkFn: () => true,
        },
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
    expect(savedConfig?.backendPort).toBe(8080);
    expect(savedConfig?.logtoConfig?.endpoint).toBe('https://mypos.logto.app');

    const owners = await userRepo.countOwners();
    expect(owners).toBe(1);
  });

  it('renders backend port field on Step 3 with default 8080', async () => {
    const wrapper = factory();

    // Go to Step 2
    await wrapper.find('[data-test="store-name-input"]').setValue('Tiệm Trà Sen');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Go to Step 3
    await wrapper.find('[data-test="admin-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Check Step 3 Backend Port controls
    const portInput = wrapper.find('[data-test="backend-port-input"]');
    expect(portInput.exists()).toBe(true);
    expect((portInput.element as HTMLInputElement).value).toBe('8080');

    expect(wrapper.find('[data-test="find-port-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="check-port-btn"]').exists()).toBe(true);
  });

  it('automatically finds next available port when "Tìm port trống" is clicked', async () => {
    // Mock: 8080 and 8081 are in use, 8082 is available
    const busy = new Set([8080, 8081]);
    const wrapper = factory({
      portServiceOptions: {
        checkFn: (p: number) => !busy.has(p),
      },
    });

    // Go to Step 3
    await wrapper.find('[data-test="store-name-input"]').setValue('Tiệm Trà Sen');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');
    await wrapper.find('[data-test="admin-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Initially 8080
    const portInput = wrapper.find('[data-test="backend-port-input"]');
    expect((portInput.element as HTMLInputElement).value).toBe('8080');

    // Click "Tìm port trống"
    await wrapper.find('[data-test="find-port-btn"]').trigger('click');
    await flushPromises();

    // Port should be updated to 8082
    expect((portInput.element as HTMLInputElement).value).toBe('8082');
    const status = wrapper.find('[data-test="port-status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain('8082');
  });

  it('checks port availability and displays warning if occupied', async () => {
    const wrapper = factory({
      portServiceOptions: {
        checkFn: () => false, // port is in use
      },
    });

    // Go to Step 3
    await wrapper.find('[data-test="store-name-input"]').setValue('Tiệm Trà Sen');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');
    await wrapper.find('[data-test="admin-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Click check port
    await wrapper.find('[data-test="check-port-btn"]').trigger('click');
    await flushPromises();

    const status = wrapper.find('[data-test="port-status"]');
    expect(status.exists()).toBe(true);
    expect(status.text().toLowerCase()).toContain('chiếm dụng');
  });

  it('validates port range and blocks proceeding on invalid port', async () => {
    const wrapper = factory();

    // Go to Step 3
    await wrapper.find('[data-test="store-name-input"]').setValue('Tiệm Trà Sen');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');
    await wrapper.find('[data-test="admin-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Set invalid port (privileged port 80)
    await wrapper.find('[data-test="backend-port-input"]').setValue('80');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    expect(wrapper.find('[data-test="step-error"]').text()).toContain('1024');
  });

  it('displays chosen port in Step 4 summary and persists it to system config', async () => {
    const wrapper = factory();

    // Step 1
    await wrapper.find('[data-test="store-name-input"]').setValue('Tiệm Cà Phê Mới');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 2
    await wrapper.find('[data-test="admin-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('SecurePass123');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 3: set custom port 8089 and choose local auth mode
    await wrapper.find('[data-test="auth-mode-local"]').trigger('click');
    await wrapper.find('[data-test="backend-port-input"]').setValue('8089');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 4: Summary
    const summaryPort = wrapper.find('[data-test="summary-backend-port"]');
    expect(summaryPort.exists()).toBe(true);
    expect(summaryPort.text()).toBe('8089');

    // Finish
    await wrapper.find('[data-test="finish-setup-btn"]').trigger('click');
    await flushPromises();

    const config = await systemRepo.getConfig();
    expect(config?.backendPort).toBe(8089);
  });

  it('updates credentials if user with same username already exists without throwing', async () => {
    // Pre-seed an existing admin with an old password and an old cashier
    await userRepo.createUser({
      username: 'admin',
      displayName: 'Old Admin',
      password: 'OldPassword123!',
      role: 'owner',
      branchIds: ['hq'],
      isActive: true,
    });
    await userRepo.createUser({
      username: 'oldcashier',
      displayName: 'Old Cashier',
      password: 'OldPassword123!',
      role: 'cashier',
      branchIds: ['hq'],
      isActive: true,
    });

    const wrapper = factory();

    // Step 1
    await wrapper.find('[data-test="store-name-input"]').setValue('Nhà Hàng Cũ Mới');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 2: enter "admin" with a new password
    await wrapper.find('[data-test="admin-username-input"]').setValue('admin');
    await wrapper.find('[data-test="admin-password-input"]').setValue('NewPassword789!');
    await wrapper.find('[data-test="admin-confirm-password-input"]').setValue('NewPassword789!');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 3
    await wrapper.find('[data-test="auth-mode-local"]').trigger('click');
    await wrapper.find('[data-test="next-step-btn"]').trigger('click');

    // Step 4: Finish
    await wrapper.find('[data-test="finish-setup-btn"]').trigger('click');
    await flushPromises();

    // Should succeed and emit complete
    expect(wrapper.emitted('complete')).toBeTruthy();

    // New password should work
    const authResult = await userRepo.authenticateLocal('admin', 'NewPassword789!');
    expect(authResult.success).toBe(true);

    // Old password should no longer work
    const oldAuth = await userRepo.authenticateLocal('admin', 'OldPassword123!');
    expect(oldAuth.success).toBe(false);

    // Old leftover cashier should be deactivated
    const leftover = await userRepo.getUserByUsername('oldcashier');
    expect(leftover?.isActive).toBe(false);
  });
});
