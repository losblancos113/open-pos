// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ReceiptModal from '../ReceiptModal.vue';
import { money } from '../../../core/money';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';
import type { BillDoc, SessionDoc } from '../../../core/order/types';
import type { BankAccountDoc } from '../../../core/qr/bank-account';

describe('ReceiptModal.vue', () => {
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
      {
        lineId: 'l2',
        productId: 'p2',
        nameSnapshot: { vi: 'Combo Ăn Sáng', en: 'Breakfast Combo' },
        unitPriceSnapshot: money(80000, 'VND'),
        qty: 1,
        comboSelections: [
          { groupKey: 'drink', optionIds: ['tra-da'] },
          { groupKey: 'side', optionIds: ['quay'] },
        ],
        modifiers: [],
        status: 'placed',
        addedAt: '2026-10-23T10:05:00.000Z',
      },
    ],
    discounts: [
      {
        type: 'fixed',
        value: 15000,
        reason: 'VIP Member',
      },
    ],
    surcharges: [
      {
        type: 'service_charge',
        name: 'Phí dịch vụ 5%',
        ratePercent: 5,
      },
    ],
    taxMode: 'exclusive',
    taxLines: [
      {
        rateId: 'vat-8',
        label: { vi: 'VAT 8%', en: 'VAT 8%' },
        rate: 8,
        base: money(215000, 'VND'),
        amount: money(17200, 'VND'),
      },
    ],
    taxTotal: money(17200, 'VND'),
    subtotal: money(230000, 'VND'),
    discountTotal: money(15000, 'VND'),
    surchargeTotal: money(10750, 'VND'),
    total: money(242950, 'VND'),
    payments: [
      {
        paymentId: 'pay-1',
        method: 'cash',
        amount: money(242950, 'VND'),
        tendered: money(300000, 'VND'),
        change: money(57050, 'VND'),
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
    guestCount: 3,
    status: 'closed',
    openedAt: '2026-10-23T10:00:00.000Z',
    openedBy: 'Thu ngân 1',
    billIds: ['bill:hq:b1'],
  };

  const bankAccount: BankAccountDoc = {
    _id: 'bank_account:hq',
    branchId: 'hq',
    bankBin: '970422',
    bankName: 'MBBank',
    accountNumber: '0901234567',
    accountName: 'QUAN PHO 24',
    updatedAt: '2026-10-23T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    // ReceiptSlip hiện QR offline ngay rồi gọi API; chặn mạng để test khép kín.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline in test'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders bill receipt details and print trigger button', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        storeInfo: { name: 'Quán Phở 24', phone: '0901234567', address: '123 Đường 3/2, Q.10' },
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Quán Phở 24');
    expect(wrapper.text()).toContain('HQ-T01-20261023-0001');
    expect(wrapper.find('[data-test="print-btn"]').exists()).toBe(true);
  });

  it('triggers window.print and emits print event when print button is clicked', async () => {
    const printSpy = vi.fn();
    window.print = printSpy;

    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        storeInfo: { name: 'Quán Phở 24', phone: '0901234567' },
      },
      global: { plugins: [i18n] },
    });

    const printBtn = wrapper.find('[data-test="print-btn"]');
    await printBtn.trigger('click');

    expect(printSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.emitted('print')).toBeTruthy();
  });

  it('renders store header info (store name, address, phone, branch)', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        storeInfo: { name: 'Quán Phở 24', phone: '0901234567', address: '123 Đường 3/2' },
        branchName: 'Chi nhánh Quận 10',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="store-name"]').text()).toBe('Quán Phở 24');
    expect(wrapper.find('[data-test="store-phone"]').text()).toContain('0901234567');
    expect(wrapper.find('[data-test="store-address"]').text()).toContain('123 Đường 3/2');
    expect(wrapper.find('[data-test="store-branch"]').text()).toContain('Chi nhánh Quận 10');
  });

  it('renders bill metadata (bill number, cashier name, table name, date)', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        session: sampleSession,
        tableName: 'Bàn 01',
        cashierName: 'Nguyễn Thu Ngân',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-bill-number"]').text()).toContain('HQ-T01-20261023-0001');
    expect(wrapper.find('[data-test="receipt-cashier"]').text()).toContain('Nguyễn Thu Ngân');
    expect(wrapper.find('[data-test="receipt-table"]').text()).toContain('Bàn 01');
    expect(wrapper.find('[data-test="receipt-date"]').exists()).toBe(true);
  });

  it('renders itemized lines with product name, variant badge, modifiers with deltas, and notes', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Phở bò tái');
    expect(wrapper.text()).toContain('Tô lớn');
    expect(wrapper.text()).toContain('Trứng: Trứng chần');
    expect(wrapper.text()).toContain('Ít bánh nhiều hành');
    expect(wrapper.text()).toContain('Combo Ăn Sáng');
  });

  it('renders financial totals: subtotal, discounts, surcharges, VAT, and grand total', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-subtotal"]').text()).toContain('230.000');
    expect(wrapper.find('[data-test="receipt-discount"]').text()).toContain('15.000');
    expect(wrapper.find('[data-test="receipt-discount"]').text()).toContain('VIP Member');
    expect(wrapper.find('[data-test="receipt-surcharge"]').text()).toContain('Phí dịch vụ 5%');
    expect(wrapper.find('[data-test="receipt-tax"]').text()).toContain('17.200');
    expect(wrapper.find('[data-test="receipt-total"]').text()).toContain('242.950');
  });

  it('renders payment breakdown (cash tendered & change, or transfer ref)', () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-payments"]').text()).toContain('300.000');
    expect(wrapper.find('[data-test="receipt-payments"]').text()).toContain('57.050');
  });

  it('renders VietQR SVG image when unpaid or transfer reference present with bank account', () => {
    const unpaidBill: BillDoc = {
      ...sampleBill,
      status: 'placed',
      balanceRemaining: money(242950, 'VND'),
      payments: [],
    };

    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: unpaidBill,
        bankAccount,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-vietqr"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-vietqr"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-vietqr"]').text()).toContain('POSHQT010001');
  });

  it('emits update:open and close event when close button is clicked', async () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
      },
      global: { plugins: [i18n] },
    });

    const closeBtn = wrapper.find('[data-test="close-receipt-btn"]');
    await closeBtn.trigger('click');

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('applies 80mm or 58mm paper width classes', async () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        paperWidth: '58mm',
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="receipt-slip"]').classes()).toContain('paper-58mm');

    await wrapper.setProps({ paperWidth: '80mm' });
    expect(wrapper.find('[data-test="receipt-slip"]').classes()).toContain('paper-80mm');
  });

  it('renders dedicated print mount in body when open and removes when closed', async () => {
    const wrapper = mount(ReceiptModal, {
      props: {
        open: true,
        bill: sampleBill,
        paperWidth: '80mm',
      },
      global: { plugins: [i18n] },
      attachTo: document.body,
    });

    const printMount = document.body.querySelector('#openpos-print-mount');
    expect(printMount).not.toBeNull();
    expect(printMount?.classList.contains('paper-80mm')).toBe(true);
    expect(printMount?.querySelector('[data-test="print-receipt-slip"]')).not.toBeNull();

    await wrapper.setProps({ open: false });
    expect(document.body.querySelector('#openpos-print-mount')).toBeNull();
    wrapper.unmount();
  });
});
