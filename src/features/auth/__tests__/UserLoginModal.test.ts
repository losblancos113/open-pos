// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import UserLoginModal from '../UserLoginModal.vue';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';
import { hashPin } from '../../../core/auth/token';
import type { UserDoc } from '../../../core/auth/types';
import { GLOBAL_BRANCH_ID } from '../../../core/db/branch';

describe('UserLoginModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  const users: UserDoc[] = [
    {
      _id: 'user:cashier1',
      docType: 'user',
      branchId: GLOBAL_BRANCH_ID,
      username: 'cashier1',
      displayName: 'Thu ngân 1',
      pinHash: hashPin('1234'),
      role: 'cashier',
      branchIds: ['hq'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '',
      updatedAt: '',
    },
    {
      _id: 'user:admin',
      docType: 'user',
      branchId: GLOBAL_BRANCH_ID,
      username: 'admin',
      displayName: 'Quản trị viên',
      pinHash: hashPin('8888'),
      role: 'owner',
      branchIds: ['hq', 'dist1'],
      isActive: true,
      schemaVersion: 1,
      createdAt: '',
      updatedAt: '',
    },
  ];

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders user selection and numeric keypad buttons', () => {
    wrapper = mount(UserLoginModal, {
      props: { open: true, users, activeBranchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="user-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="pin-display"]').exists()).toBe(true);
    for (let i = 0; i <= 9; i++) {
      expect(wrapper.find(`[data-test="keypad-${i}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-test="keypad-clear"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="keypad-backspace"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="login-submit-btn"]').exists()).toBe(true);
  });

  it('enters PIN using keypad and emits loginSuccess on valid PIN', async () => {
    wrapper = mount(UserLoginModal, {
      props: { open: true, users, activeBranchId: 'hq' },
      global: { plugins: [i18n] },
    });

    // Enter 1 2 3 4
    await wrapper.find('[data-test="keypad-1"]').trigger('click');
    await wrapper.find('[data-test="keypad-2"]').trigger('click');
    await wrapper.find('[data-test="keypad-3"]').trigger('click');
    await wrapper.find('[data-test="keypad-4"]').trigger('click');

    await wrapper.find('[data-test="login-submit-btn"]').trigger('click');

    expect(wrapper.emitted('loginSuccess')).toBeTruthy();
    const [user] = wrapper.emitted('loginSuccess')![0] as [UserDoc];
    expect(user.username).toBe('cashier1');
  });

  it('displays error message on invalid PIN', async () => {
    wrapper = mount(UserLoginModal, {
      props: { open: true, users, activeBranchId: 'hq' },
      global: { plugins: [i18n] },
    });

    // Enter wrong PIN: 9 9 9 9
    await wrapper.find('[data-test="keypad-9"]').trigger('click');
    await wrapper.find('[data-test="keypad-9"]').trigger('click');
    await wrapper.find('[data-test="keypad-9"]').trigger('click');
    await wrapper.find('[data-test="keypad-9"]').trigger('click');

    await wrapper.find('[data-test="login-submit-btn"]').trigger('click');

    expect(wrapper.emitted('loginSuccess')).toBeFalsy();
    expect(wrapper.find('[data-test="login-error"]').exists()).toBe(true);
  });

  it('emits cancel when close button or cancel button is clicked', async () => {
    wrapper = mount(UserLoginModal, {
      props: { open: true, users, activeBranchId: 'hq' },
      global: { plugins: [i18n] },
    });

    const closeBtn = wrapper.find('[data-test="close-login-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(1);

    const cancelBtn = wrapper.find('[data-test="login-cancel-btn"]');
    expect(cancelBtn.exists()).toBe(true);
    await cancelBtn.trigger('click');
    expect(wrapper.emitted('cancel')).toHaveLength(2);
  });
});
