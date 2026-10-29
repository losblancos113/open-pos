// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import BillingSettingsModal from '../BillingSettingsModal.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import type { UserDoc } from '../../../core/auth/types';
import type { BillingSettingsDoc } from '../../../core/order/billing-settings';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';

describe('BillingSettingsModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  const managerUser: UserDoc = {
    _id: 'user:manager1',
    branchId: '*',
    username: 'manager1',
    displayName: 'Quản lý 1',
    role: 'manager',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    docType: 'user',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  };

  const cashierUser: UserDoc = {
    _id: 'user:cashier1',
    branchId: '*',
    username: 'cashier1',
    displayName: 'Thu ngân 1',
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    docType: 'user',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  };

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders discount, surcharge, and tax sections', () => {
    wrapper = mount(BillingSettingsModal, {
      props: { open: true, currentUser: managerUser, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="discount-settings-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="surcharge-settings-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tax-settings-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="save-billing-settings-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="billing-settings-forbidden-banner"]').exists()).toBe(false);
  });

  it('restricts editing and shows forbidden banner for cashier/staff role', () => {
    wrapper = mount(BillingSettingsModal, {
      props: { open: true, currentUser: cashierUser, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="billing-settings-forbidden-banner"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="save-billing-settings-btn"]').exists()).toBe(false);
  });

  it('saves settings to repository and emits save event when saved by manager', async () => {
    const adapter = await createMemoryAdapter();
    const orderRepo = createOrderRepository(adapter);
    const saveSpy = vi.spyOn(orderRepo, 'saveBillingSettings');

    wrapper = mount(BillingSettingsModal, {
      props: {
        open: true,
        currentUser: managerUser,
        branchId: 'hq',
        orderRepository: orderRepo,
      },
      global: { plugins: [i18n] },
    });

    await nextTick();

    const saveBtn = wrapper.find('[data-test="save-billing-settings-btn"]');
    expect(saveBtn.exists()).toBe(true);

    await saveBtn.trigger('click');
    await nextTick();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('save')).toBeTruthy();
    const emittedDoc = wrapper.emitted('save')![0]![0] as BillingSettingsDoc;
    expect(emittedDoc.branchId).toBe('hq');
    expect(emittedDoc.taxEnabled).toBe(true);
  });
});
