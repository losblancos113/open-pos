// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SplitBillDialog from '../SplitBillDialog.vue';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import { money } from '../../../core/money';
import type { BillDoc } from '../../../core/order/types';

describe('SplitBillDialog.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const bill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-0001',
    paymentRef: 'POSHQT010001',
    status: 'placed',
    lines: [
      { lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'Phở', en: 'Pho' }, unitPriceSnapshot: money(50000, 'VND'), qty: 1, modifiers: [], status: 'placed', addedAt: '2026-10-24T00:00:00.000Z', seat: 1 },
      { lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'Cà phê', en: 'Coffee' }, unitPriceSnapshot: money(20000, 'VND'), qty: 1, modifiers: [], status: 'placed', addedAt: '2026-10-24T00:00:00.000Z', seat: 2 },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(70000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(70000, 'VND'),
    payments: [],
    balanceRemaining: money(70000, 'VND'),
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  };

  it('has split mode tab buttons', () => {
    const wrapper = mount(SplitBillDialog, {
      props: { bill, open: true },
      global: { plugins: [i18n] },
    });
    // Check tab buttons exist (they're rendered regardless of Dialog portal)
    expect(wrapper.html()).toContain('tab-by-item');
    expect(wrapper.html()).toContain('tab-evenly');
    expect(wrapper.html()).toContain('tab-by-seat');
  });

  it('shows line checkboxes in by-item mode', () => {
    const wrapper = mount(SplitBillDialog, {
      props: { bill, open: true },
      global: { plugins: [i18n] },
    });
    // By default mode is 'by-item', so checkboxes should be visible
    expect(wrapper.html()).toContain('line-checkbox');
    expect(wrapper.findAll('[data-test="line-checkbox"]').length).toBeGreaterThanOrEqual(1);
  });

  it('shows evenly split input', () => {
    const wrapper = mount(SplitBillDialog, {
      props: { bill, open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.html()).toContain('evenly-parts-input');
  });

  it('shows seat groups in by-seat mode', () => {
    const wrapper = mount(SplitBillDialog, {
      props: { bill, open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.html()).toContain('seat-group');
    expect(wrapper.findAll('[data-test="seat-group"]').length).toBeGreaterThanOrEqual(1);
  });
});
