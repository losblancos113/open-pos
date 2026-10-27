// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import BranchAdminModal from '../BranchAdminModal.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createBranchRepository, type BranchRepository } from '@/core/branch/branch-repository';
import { createI18n } from 'vue-i18n';
import viMessages from '@/i18n/vi.json';
import enMessages from '@/i18n/en.json';

describe('BranchAdminModal.vue', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'vi',
    messages: { vi: viMessages, en: enMessages },
  });
  let wrapper: VueWrapper | null = null;
  let repo: BranchRepository;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders modal title and seeded branches when open', async () => {
    wrapper = mount(BranchAdminModal, {
      props: { open: true, branchRepo: repo },
      global: { plugins: [i18n] },
    });

    // Wait for branch repo to load
    await new Promise((r) => setTimeout(r, 20));

    expect(wrapper.find('[data-test="branch-admin-modal"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Quản lý chi nhánh');
    expect(wrapper.text()).toContain('Trụ sở chính');
  });

  it('emits close when top close button is clicked', async () => {
    wrapper = mount(BranchAdminModal, {
      props: { open: true, branchRepo: repo },
      global: { plugins: [i18n] },
    });

    const closeBtn = wrapper.find('[data-test="close-admin-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close when bottom cancel/close button is clicked', async () => {
    wrapper = mount(BranchAdminModal, {
      props: { open: true, branchRepo: repo },
      global: { plugins: [i18n] },
    });

    const cancelBtn = wrapper.find('[data-test="cancel-branch-btn"]');
    expect(cancelBtn.exists()).toBe(true);
    await cancelBtn.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('shows validation error when code or name is missing', async () => {
    wrapper = mount(BranchAdminModal, {
      props: { open: true, branchRepo: repo },
      global: { plugins: [i18n] },
    });

    const saveBtn = wrapper.find('[data-test="save-branch-btn"]');
    await saveBtn.trigger('click');

    expect(wrapper.find('[data-test="branch-admin-error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Mã và tên chi nhánh là bắt buộc');
  });

  it('creates branch, shows success feedback, and emits branchSaved', async () => {
    wrapper = mount(BranchAdminModal, {
      props: { open: true, branchRepo: repo },
      global: { plugins: [i18n] },
    });

    // Enter branch info
    const codeInput = wrapper.find('[data-test="branch-code-input"]');
    const nameInput = wrapper.find('[data-test="branch-name-input"]');
    const addrInput = wrapper.find('[data-test="branch-address-input"]');
    const phoneInput = wrapper.find('[data-test="branch-phone-input"]');

    await codeInput.setValue('CN_TEST');
    await nameInput.setValue('Chi nhánh Thử nghiệm');
    await addrInput.setValue('456 Đường ABC');
    await phoneInput.setValue('0987654321');

    const saveBtn = wrapper.find('[data-test="save-branch-btn"]');
    await saveBtn.trigger('click');

    // Wait for async repo operations
    await new Promise((r) => setTimeout(r, 50));

    expect(wrapper.emitted('branchSaved')).toBeTruthy();
    expect(wrapper.find('[data-test="branch-admin-success"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Thêm chi nhánh thành công');
    expect(wrapper.text()).toContain('Chi nhánh Thử nghiệm');
  });
});
