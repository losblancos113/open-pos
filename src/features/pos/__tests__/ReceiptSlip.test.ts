// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ReceiptSlip from '../ReceiptSlip.vue';
import { money } from '../../../core/money';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';
import type { BillDoc, SessionDoc } from '../../../core/order/types';
import type { BankAccountDoc } from '../../../core/qr/bank-account';

describe('ReceiptSlip.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });

  const sampleBill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261023-0001',
    paymentRef: 'POSHQT010001',
    status: 'paid',
    lines: [
      {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Phở bò tái', en: 'Beef Pho' },
        unitPriceSnapshot: money(65000, 'VND'),
        variantId: 'v-large',
        variantNameSnapshot: 'Tô lớn',
        qty: 2,
        modifiers: [
          {
            groupId: 'g-egg',
            groupNameSnapshot: 'Trứng',
            optionId: 'opt-egg',
            optionNameSnapshot: 'Trứng chần',
            priceDelta: money(10000, 'VND'),
          },
        ],
        note: 'Ít bánh nhiều hành',
        status: 'placed',
        addedAt: '2026-10-23T10:00:00.000Z',
      },
    ],
    discounts: [
      {
        type: 'fixed',
        value: 15000,
        reason: 'Khách quen',
      },
    ],
    surcharges: [
      {
        type: 'service_charge',
        name: 'Phí dịch vụ 5%',
        ratePercent: 5,
      },
    ],
    taxLines: [
      {
        rateId: 'vat-8',
        label: { vi: 'VAT 8%', en: 'VAT 8%' },
        rate: 8,
        base: money(150000, 'VND'),
        amount: money(12000, 'VND'),
      },
    ],
    subtotal: money(150000, 'VND'),
    discountTotal: money(15000, 'VND'),
    surchargeTotal: money(7500, 'VND'),
    taxMode: 'exclusive',
    taxTotal: money(12000, 'VND'),
    total: money(154500, 'VND'),
    paidAt: '2026-10-23T10:30:00.000Z',
    payments: [
      {
        paymentId: 'pay-1',
        method: 'cash',
        amount: money(154500, 'VND'),
        tendered: money(200000, 'VND'),
        change: money(45500, 'VND'),
        createdAt: '2026-10-23T10:30:00.000Z',
      },
    ],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:30:00.000Z',
  };

  const sampleSession: SessionDoc = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'],
    guestCount: 2,
    status: 'closed',
    openedAt: '2026-10-23T10:00:00.000Z',
    openedBy: 'Thu ngân A',
    billIds: ['bill:hq:b1'],
  };

  it('renders store info, bill metadata, and itemized lines correctly', () => {
    const wrapper = mount(ReceiptSlip, {
      props: {
        bill: sampleBill,
        session: sampleSession,
        tableName: 'Bàn 1',
        cashierName: 'Thu ngân A',
        branchName: 'Chi nhánh Quận 1',
        storeInfo: {
          name: 'Phở Gia Truyền',
          address: '456 Lê Lợi, Q.1',
          phone: '0988776655',
        },
        paperWidth: '80mm',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="store-name"]').text()).toBe('Phở Gia Truyền');
    expect(wrapper.find('[data-test="store-address"]').text()).toBe('456 Lê Lợi, Q.1');
    expect(wrapper.find('[data-test="store-phone"]').text()).toContain('0988776655');
    expect(wrapper.find('[data-test="receipt-bill-number"]').text()).toContain('HQ-T01-20261023-0001');
    expect(wrapper.find('[data-test="receipt-table"]').text()).toContain('Bàn 1');
    expect(wrapper.find('[data-test="receipt-cashier"]').text()).toContain('Thu ngân A');
    expect(wrapper.text()).toContain('Phở bò tái');
    expect(wrapper.text()).toContain('Tô lớn');
    expect(wrapper.text()).toContain('Trứng chần');
    expect(wrapper.text()).toContain('Ít bánh nhiều hành');
    expect(wrapper.find('[data-test="receipt-total"]').text()).toContain('154.500');
    expect(wrapper.classes()).toContain('paper-80mm');
  });

  it('adapts to 58mm width format', () => {
    const wrapper = mount(ReceiptSlip, {
      props: {
        bill: sampleBill,
        paperWidth: '58mm',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.classes()).toContain('paper-58mm');
  });

  it('renders VietQR when bank account is provided and bill is unpaid', () => {
    const unpaidBill: BillDoc = {
      ...sampleBill,
      status: 'placed',
      balanceRemaining: money(154500, 'VND'),
      payments: [],
    };

    const bankAccount: BankAccountDoc = {
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '123456789',
      accountName: 'PHO GIA TRUYEN',
      updatedAt: '2026-10-23T00:00:00.000Z',
    };

    const wrapper = mount(ReceiptSlip, {
      props: {
        bill: unpaidBill,
        bankAccount,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-vietqr"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-vietqr"] svg').exists()).toBe(true);
  });
});
