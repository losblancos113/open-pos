// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TransferTableDialog from '../TransferTableDialog.vue';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import { money } from '../../../core/money';

describe('TransferTableDialog.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const session = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'] as string[],
    guestCount: 2,
    status: 'open' as const,
    openedAt: '2026-10-24T00:00:00.000Z',
    openedBy: 'cashier1',
    billIds: ['bill:hq:b1'] as string[],
  } as const;

  const tables = [
    {
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'T1',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
      status: 'occupied' as const,
    },
    {
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'T2',
      name: 'Bàn 2',
      capacity: 4,
      sortOrder: 2,
      createdAt: '2026-10-24T00:00:00.000Z',
      status: 'empty' as const,
    },
    {
      _id: 'table:hq:t3',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'T3',
      name: 'Bàn 3',
      capacity: 4,
      sortOrder: 3,
      createdAt: '2026-10-24T00:00:00.000Z',
      status: 'empty' as const,
    },
  ];

  const bill = {
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
    taxTotal: money(0, 'VND'),
    subtotal: money(50000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(50000, 'VND'),
    payments: [],
    balanceRemaining: money(50000, 'VND'),
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
  };

  it('renders table selection dropdown', () => {
    const wrapper = mount(TransferTableDialog, {
      props: { session, tables, currentBill: bill, otherBills: [], open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.find('[data-test="target-table-select"]').exists()).toBe(true);
  });

  it('shows available tables excluding current', () => {
    const wrapper = mount(TransferTableDialog, {
      props: { session, tables, currentBill: bill, otherBills: [], open: true },
      global: { plugins: [i18n] },
    });
    const options = wrapper.findAll('[data-test="table-option"]');
    expect(options.length).toBeGreaterThanOrEqual(1);
    expect(wrapper.html()).toContain('Bàn 2');
    expect(wrapper.html()).toContain('Bàn 3');
  });

  it('excludes current table from options', () => {
    const wrapper = mount(TransferTableDialog, {
      props: { session, tables, currentBill: bill, otherBills: [], open: true },
      global: { plugins: [i18n] },
    });
    expect(wrapper.html()).not.toContain('table:hq:t1');
  });
});