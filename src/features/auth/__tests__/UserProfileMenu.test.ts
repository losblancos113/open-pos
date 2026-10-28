// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import UserProfileMenu from '../UserProfileMenu.vue';
import { useCurrentUser } from '../use-current-user';
import viMessages from '@/i18n/vi.json';
import enMessages from '@/i18n/en.json';
import type { UserDoc } from '@/core/auth/types';

describe('UserProfileMenu.vue', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'vi',
    messages: {
      vi: viMessages,
      en: enMessages,
    },
  });

  const testUser: UserDoc = {
    _id: 'user:admin',
    docType: 'user',
    branchId: '*',
    username: 'admin',
    displayName: 'Quản trị viên',
    role: 'owner',
    branchIds: ['hq', 'dist1'],
    authProvider: 'local',
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  function factory(props = {}) {
    return mount(UserProfileMenu, {
      props: {
        open: true,
        user: testUser,
        activeBranchName: 'Trụ sở chính',
        ...props,
      },
      global: {
        plugins: [i18n],
      },
    });
  }

  it('renders user details when open is true', () => {
    const wrapper = factory();
    expect(wrapper.find('[data-test="user-profile-menu"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Quản trị viên');
    expect(wrapper.text()).toContain('@admin');
    expect(wrapper.text()).toContain('Trụ sở chính');
  });

  it('emits switchUser when clicking switch user button', async () => {
    const wrapper = factory();
    const switchBtn = wrapper.find('[data-test="switch-user-btn"]');
    expect(switchBtn.exists()).toBe(true);

    await switchBtn.trigger('click');
    expect(wrapper.emitted('switchUser')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('calls logout and emits logout event when clicking logout button', async () => {
    const { currentUser, setUser } = useCurrentUser();
    setUser(testUser, 'hq');

    const wrapper = factory();
    const logoutBtn = wrapper.find('[data-test="logout-btn"]');
    expect(logoutBtn.exists()).toBe(true);

    await logoutBtn.trigger('click');
    expect(wrapper.emitted('logout')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
    expect(currentUser.value).toBeNull();
  });

  it('emits close when clicking backdrop or close button', async () => {
    const wrapper = factory();
    const backdrop = wrapper.find('[data-test="profile-menu-backdrop"]');
    await backdrop.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('applies left-0 alignment when trigger button is near left edge of viewport', async () => {
    const parent = document.createElement('div');
    parent.className = 'relative';
    parent.getBoundingClientRect = () => ({
      left: 10,
      right: 150,
      top: 10,
      bottom: 40,
      width: 140,
      height: 30,
      x: 10,
      y: 10,
      toJSON: () => {},
    });
    document.body.appendChild(parent);

    const wrapper = mount(UserProfileMenu, {
      attachTo: parent,
      props: {
        open: true,
        user: testUser,
        activeBranchName: 'Trụ sở chính',
      },
      global: {
        plugins: [i18n],
      },
    });
    await flushPromises();

    const menu = wrapper.find('[data-test="user-profile-menu"]');
    expect(menu.classes()).toContain('left-0');
    expect(menu.classes()).not.toContain('right-0');

    wrapper.unmount();
    parent.remove();
  });

  it('applies right-0 alignment when trigger button has sufficient room on the left', async () => {
    const parent = document.createElement('div');
    parent.className = 'relative';
    parent.getBoundingClientRect = () => ({
      left: 800,
      right: 950,
      top: 10,
      bottom: 40,
      width: 150,
      height: 30,
      x: 800,
      y: 10,
      toJSON: () => {},
    });
    document.body.appendChild(parent);

    const wrapper = mount(UserProfileMenu, {
      attachTo: parent,
      props: {
        open: true,
        user: testUser,
        activeBranchName: 'Trụ sở chính',
      },
      global: {
        plugins: [i18n],
      },
    });
    await flushPromises();

    const menu = wrapper.find('[data-test="user-profile-menu"]');
    expect(menu.classes()).toContain('right-0');
    expect(menu.classes()).not.toContain('left-0');

    wrapper.unmount();
    parent.remove();
  });

  it('includes viewport-bounded max-width constraint for narrow viewports', () => {
    const wrapper = factory();
    const menu = wrapper.find('[data-test="user-profile-menu"]');
    expect(menu.classes()).toContain('max-w-[calc(100vw-1.5rem)]');
  });
});
