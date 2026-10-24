// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BillMenuItem from '../BillMenuItem.vue';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import type { BillDoc } from '../../../core/order/types';

describe('BillMenuItem.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const bill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-0001',
    paymentRef: 'POSHQT010001',
    status: 'placed',
    lines: [
      { lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'Phở', en: 'Pho' }, unitPriceSnapshot: { minor: 50000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '', seat: 1 },
      { lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'Cà phê', en: 'Coffee' }, unitPriceSnapshot: { minor: 20000, currency: 'VND' }, qty: 1, modifiers: [], status: 'placed', addedAt: '', seat: 2 },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: { minor: 0, currency: 'VND' },
    subtotal: { minor: 70000, currency: 'VND' },
    discountTotal: { minor: 0, currency: 'VND' },
    surchargeTotal: { minor: 0, currency: 'VND' },
    total: { minor: 70000, currency: 'VND' },
    payments: [],
    balanceRemaining: { minor: 70000, currency: 'VND' },
    createdAt: '',
    updatedAt: '',
  };

  it('renders split, merge, and transfer buttons', () => {
    const wrapper = mount(BillMenuItem, {
      props: { bill },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('[data-test="split-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="merge-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="transfer-btn"]').exists()).toBe(true);
  });

  it('emits split event when split button clicked', async () => {
    const wrapper = mount(BillMenuItem, {
      props: { bill },
      global: { plugins: [i18n] },
    });
    await wrapper.find('[data-test="split-btn"]').trigger('click');
    expect(wrapper.emitted('split')).toBeTruthy();
  });

  it('emits merge-bills event when merge button clicked', async () => {
    const wrapper = mount(BillMenuItem, {
      props: { bill },
      global: { plugins: [i18n] },
    });
    await wrapper.find('[data-test="merge-btn"]').trigger('click');
    // Vue converts camelCase to kebab-case in emitted events
    expect(wrapper.emitted('mergeBills') || wrapper.emitted('merge-bills')).toBeTruthy();
  });

  it('emits transfer-table event when transfer button clicked', async () => {
    const wrapper = mount(BillMenuItem, {
      props: { bill },
      global: { plugins: [i18n] },
    });
    await wrapper.find('[data-test="transfer-btn"]').trigger('click');
    // Vue converts camelCase to kebab-case in emitted events
    expect(wrapper.emitted('transferTable') || wrapper.emitted('transfer-table')).toBeTruthy();
  });
});
