// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import UserAdminModal from '../UserAdminModal.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createUserRepository } from '@/core/auth/user-repository';
import { createBranchRepository } from '@/core/branch/branch-repository';
import viMessages from '@/i18n/vi.json';
import enMessages from '@/i18n/en.json';

describe('UserAdminModal.vue', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'vi',
    messages: {
      vi: viMessages,
      en: enMessages,
    },
  });

  let adapter: any;
  let userRepo: any;
  let branchRepo: any;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    userRepo = createUserRepository(adapter);
    branchRepo = createBranchRepository(adapter);

    await branchRepo.createBranch({ code: 'HQ', name: 'Trụ sở chính' });
    await branchRepo.createBranch({ code: 'DIST1', name: 'Chi nhánh Quận 1' });

    await userRepo.createUser({
      username: 'admin',
      displayName: 'Super Admin',
      password: 'AdminPassword123!',
      role: 'owner',
      branchIds: ['hq', 'dist1'],
    });

    await userRepo.createUser({
      username: 'cashier1',
      displayName: 'Thu ngân 1',
      password: 'CashierPassword!',
      pin: '1234',
      role: 'cashier',
      branchIds: ['hq'],
    });
  });

  function factory(props = {}) {
    return mount(UserAdminModal, {
      props: {
        open: true,
        userRepo,
        branchRepo,
        ...props,
      },
      global: {
        plugins: [i18n],
      },
    });
  }

  it('renders user list when open', async () => {
    const wrapper = factory();
    await flushPromises();

    expect(wrapper.find('[data-test="user-admin-modal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('admin');
    expect(wrapper.text()).toContain('cashier1');
  });

  it('creates a new user successfully', async () => {
    const wrapper = factory();
    await flushPromises();

    // Click Add User button
    await wrapper.find('[data-test="open-add-user-btn"]').trigger('click');

    // Fill form
    await wrapper.find('[data-test="new-username-input"]').setValue('manager_q1');
    await wrapper.find('[data-test="new-display-name-input"]').setValue('Quản lý Q1');
    await wrapper.find('[data-test="new-password-input"]').setValue('ManagerPass123!');
    await wrapper.find('[data-test="new-pin-input"]').setValue('4321');
    await wrapper.find('[data-test="new-role-select"]').setValue('manager');

    // Submit
    await wrapper.find('[data-test="submit-create-user-btn"]').trigger('click');
    await flushPromises();

    const created = await userRepo.getUserByUsername('manager_q1');
    expect(created).not.toBeNull();
    expect(created?.displayName).toBe('Quản lý Q1');
    expect(created?.role).toBe('manager');

    // Should appear in the list
    expect(wrapper.text()).toContain('manager_q1');
  });

  it('edits an existing user role and status', async () => {
    const wrapper = factory();
    await flushPromises();

    // Click edit cashier1
    await wrapper.find('[data-test="edit-user-btn-cashier1"]').trigger('click');

    // Change display name and role
    await wrapper.find('[data-test="edit-display-name-input"]').setValue('Thu ngân Trưởng');
    await wrapper.find('[data-test="edit-role-select"]').setValue('manager');

    // Save
    await wrapper.find('[data-test="save-edit-user-btn"]').trigger('click');
    await flushPromises();

    const updated = await userRepo.getUserByUsername('cashier1');
    expect(updated?.displayName).toBe('Thu ngân Trưởng');
    expect(updated?.role).toBe('manager');
  });
});
