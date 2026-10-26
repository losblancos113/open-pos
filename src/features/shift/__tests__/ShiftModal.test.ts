// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createShiftRepository } from '@/core/shift/shift-repository';
import { money } from '@/core/money';
import ShiftModal from '../ShiftModal.vue';

describe('ShiftModal.vue', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let repo: ReturnType<typeof createShiftRepository>;
  const activeBranchId = ref('hq');
  const activeDeviceId = ref('term_01');

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createShiftRepository(adapter);
  });

  it('renders modal when open: true and emits close on button click', async () => {
    const wrapper = mount(ShiftModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
        deviceId: activeDeviceId.value,
        currentUser: { userId: 'u1', displayName: 'Alice' },
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    expect(wrapper.find('[data-test="shift-modal"]').exists()).toBe(true);

    const closeBtn = wrapper.find('[data-test="close-shift-modal-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('displays open shift form when no active shift exists and allows opening a shift', async () => {
    const wrapper = mount(ShiftModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
        deviceId: activeDeviceId.value,
        currentUser: { userId: 'u1', displayName: 'Alice' },
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(wrapper.find('[data-test="open-shift-form"]').exists()).toBe(true);
    const openBtn = wrapper.find('[data-test="open-shift-btn"]');
    expect(openBtn.exists()).toBe(true);

    await openBtn.trigger('submit');
    await new Promise((r) => setTimeout(r, 50));

    // Active shift is now open
    const active = await repo.getActiveShift('hq', 'term_01');
    expect(active).not.toBeNull();
  });

  it('displays active shift details, cash drop form, and close shift section when shift is open', async () => {
    // Open a shift first
    await repo.openShift({
      branchId: 'hq',
      deviceId: 'term_01',
      userId: 'u1',
      userName: 'Alice',
      openingCash: money(500000, 'VND'),
    });

    const wrapper = mount(ShiftModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
        deviceId: activeDeviceId.value,
        currentUser: { userId: 'u1', displayName: 'Alice' },
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(wrapper.find('[data-test="active-shift-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cash-movement-form"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="close-shift-form"]').exists()).toBe(true);
  });
});
