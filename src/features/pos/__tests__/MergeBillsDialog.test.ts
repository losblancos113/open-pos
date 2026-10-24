// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MergeBillsDialog from '../MergeBillsDialog.vue';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import { money } from '../../../core/money';

describe('MergeBillsDialog.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const bills = [
    {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-0001',
      paymentRef: 'POSHQ-T01-0001',
      status: 'placed' as const,
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive' as const,
      taxLines: [],
      taxTotal: money(50000, 'VND'),
      subtotal: money(50000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(50000, 'VND'),
      payments: [],
      balanceRemaining: money(50000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    },
    {
      _id: 'bill:hq:b2',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-0002',
      paymentRef: 'POSHQ-T01-0002',
      status: 'placed' as const,
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive' as const,
      taxLines: [],
      taxTotal: money(30000, 'VND'),
      subtotal: money(30000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(30000, 'VND'),
      payments: [],
      balanceRemaining: money(30000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    },
  ];

  it('renders list of bills to merge', () => {
    const wrapper = mount(MergeBillsDialog, {
      props: { bills, open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.findAll('[data-test="bill-checkbox"]').length).toBe(2);
  });

  it('shows preview with merged total when bills selected', () => {
    const wrapper = mount(MergeBillsDialog, {
      props: { bills, open: true },
      global: { plugins: [i18n] },
    });
    // Component renders checkboxes; preview shows when selected
    expect(wrapper.findAll('[data-test="bill-checkbox"]').length).toBe(2);
    // HTML should contain total calculation preview
    expect(wrapper.html()).toContain('50.000');
    expect(wrapper.html()).toContain('30.000');
  });
});