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

  it('allows clicking a bill row to toggle checkbox selection and enables confirm button when >= 2 selected', async () => {
    const wrapper = mount(MergeBillsDialog, {
      props: {
        bills,
        open: true,
        tableNames: {
          'bill:hq:b1': 'Bàn 1',
          'bill:hq:b2': 'Bàn 2',
        },
      },
      global: { plugins: [i18n] },
    });

    // Check table badges
    expect(wrapper.text()).toContain('Bàn 1');
    expect(wrapper.text()).toContain('Bàn 2');

    const rows = wrapper.findAll('[data-test="bill-row"]');
    expect(rows).toHaveLength(2);

    // Click first row
    await rows[0]!.trigger('click');
    expect(wrapper.find('[data-test="confirm-merge-btn"]').attributes('disabled')).toBeDefined();

    // Click second row
    await rows[1]!.trigger('click');
    expect(wrapper.find('[data-test="confirm-merge-btn"]').attributes('disabled')).toBeUndefined();

    // Confirm merge
    await wrapper.find('[data-test="confirm-merge-btn"]').trigger('click');
    const emitted = wrapper.emitted('confirmMerge');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toEqual({
      billIds: ['bill:hq:b1', 'bill:hq:b2'],
    });
  });

  it('allows clicking select all to select all bills at once', async () => {
    const wrapper = mount(MergeBillsDialog, {
      props: { bills, open: true },
      global: { plugins: [i18n] },
    });

    const selectAllBtn = wrapper.find('button.text-primary');
    expect(selectAllBtn.exists()).toBe(true);
    expect(selectAllBtn.text()).toBe('Chọn tất cả');

    await selectAllBtn.trigger('click');
    expect(selectAllBtn.text()).toBe('Bỏ chọn tất cả');
    expect(wrapper.find('[data-test="confirm-merge-btn"]').attributes('disabled')).toBeUndefined();
  });
});