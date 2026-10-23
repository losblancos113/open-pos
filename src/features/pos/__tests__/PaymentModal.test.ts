// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PaymentModal from '../PaymentModal.vue';
import { money } from '../../../core/money';
import type { BillDoc, PaymentEntry } from '../../../core/order/types';
import type { BankAccountDoc } from '../../../core/qr/bank-account';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';

describe('PaymentModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  const mockBill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261023-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(135000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(135000, 'VND'),
    payments: [],
    balanceRemaining: money(135000, 'VND'),
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
  };

  const mockBankAccount: BankAccountDoc = {
    _id: 'bank_account:hq',
    branchId: 'hq',
    bankBin: '970422',
    bankName: 'MBBank',
    accountNumber: '0901234567',
    accountName: 'NGUYEN VAN A',
    updatedAt: '2026-10-23T00:00:00.000Z',
  };

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
  });

  it('renders payment method tabs and remaining balance', () => {
    wrapper = mount(PaymentModal, {
      props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('135.000');
    expect(wrapper.find('[data-test="tab-cash"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-vietqr"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-other"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="balance-remaining"]').text()).toContain('135.000');
  });

  describe('Cash Tab & Keypad', () => {
    it('sets tendered amount from quick denomination buttons and calculates change in real time', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Default tab is cash
      expect(wrapper.find('[data-test="denom-50k"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="denom-100k"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="denom-200k"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="denom-500k"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="denom-exact"]').exists()).toBe(true);

      // Click 200.000
      await wrapper.find('[data-test="denom-200k"]').trigger('click');
      await nextTick();

      const tenderedInput = wrapper.find('[data-test="tendered-input"] input');
      expect((tenderedInput.element as HTMLInputElement).value).toBe('200000');

      // Change: 200.000 - 135.000 = 65.000
      expect(wrapper.find('[data-test="change-amount"]').text()).toContain('65.000');

      // Click 500.000
      await wrapper.find('[data-test="denom-500k"]').trigger('click');
      await nextTick();
      expect((tenderedInput.element as HTMLInputElement).value).toBe('500000');
      expect(wrapper.find('[data-test="change-amount"]').text()).toContain('365.000');

      // Click "Đúng số tiền" (Exact) -> 135.000
      await wrapper.find('[data-test="denom-exact"]').trigger('click');
      await nextTick();
      expect((tenderedInput.element as HTMLInputElement).value).toBe('135000');
      expect(wrapper.find('[data-test="change-amount"]').text()).toContain('0');
    });

    it('allows typing custom tendered amount and updates change calculation', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      const tenderedInput = wrapper.find('[data-test="tendered-input"] input');
      await tenderedInput.setValue('150000');
      await nextTick();

      // 150.000 - 135.000 = 15.000
      expect(wrapper.find('[data-test="change-amount"]').text()).toContain('15.000');
    });

    it('emits payment-added and complete when full cash payment is confirmed', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Click 200.000
      await wrapper.find('[data-test="denom-200k"]').trigger('click');
      await nextTick();

      // Click confirm payment
      const confirmBtn = wrapper.find('[data-test="confirm-payment-btn"]');
      expect(confirmBtn.exists()).toBe(true);
      await confirmBtn.trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')).toBeTruthy();
      const emittedPayment = wrapper.emitted('payment-added')?.[0]?.[0] as PaymentEntry;
      expect(emittedPayment).toMatchObject({
        method: 'cash',
        amount: money(135000, 'VND'),
        tendered: money(200000, 'VND'),
        change: money(65000, 'VND'),
      });
      expect(typeof emittedPayment.paymentId).toBe('string');
      expect(typeof emittedPayment.createdAt).toBe('string');

      // Since balanceRemaining was 135.000 and paid 135.000, emits complete
      expect(wrapper.emitted('complete')).toBeTruthy();
      expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    });

    it('disables confirm button when cash tendered is less than amount to pay', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      const tenderedInput = wrapper.find('[data-test="tendered-input"] input');
      await tenderedInput.setValue('100000');
      await nextTick();

      expect(wrapper.find('[data-test="tendered-error"]').exists()).toBe(true);
      const confirmBtn = wrapper.find('[data-test="confirm-payment-btn"]');
      expect(confirmBtn.attributes('disabled')).toBeDefined();
    });
  });

  describe('VietQR Tab', () => {
    it('shows guidance and open-bank-settings button when bankAccount is unconfigured', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: null },
        global: { plugins: [i18n] },
      });

      // Switch to VietQR tab
      await wrapper.find('[data-test="tab-vietqr"]').trigger('click');
      await nextTick();

      expect(wrapper.find('[data-test="vietqr-missing-account"]').exists()).toBe(true);
      expect(wrapper.find('[data-test="open-bank-settings-btn"]').exists()).toBe(true);

      await wrapper.find('[data-test="open-bank-settings-btn"]').trigger('click');
      expect(wrapper.emitted('open-bank-settings')).toBeTruthy();
    });

    it('generates dynamic VietQR SVG, displays transfer content, and copies to clipboard', async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: writeTextMock,
        },
        writable: true,
        configurable: true,
      });

      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Switch to VietQR tab
      await wrapper.find('[data-test="tab-vietqr"]').trigger('click');
      await nextTick();

      // Dynamic QR SVG exists
      const qrSvgContainer = wrapper.find('[data-test="vietqr-svg"]');
      expect(qrSvgContainer.exists()).toBe(true);
      expect(qrSvgContainer.html()).toContain('<svg');

      // Transfer content
      const transferContent = wrapper.find('[data-test="transfer-content"]');
      expect(transferContent.exists()).toBe(true);
      expect(transferContent.text()).toContain('POSHQT010001');

      // Account info displayed
      expect(wrapper.text()).toContain('MBBank');
      expect(wrapper.text()).toContain('0901234567');
      expect(wrapper.text()).toContain('NGUYEN VAN A');

      // Copy transfer content
      const copyBtn = wrapper.find('[data-test="copy-ref-btn"]');
      expect(copyBtn.exists()).toBe(true);
      await copyBtn.trigger('click');
      expect(writeTextMock).toHaveBeenCalledWith('POSHQT010001');

      // Confirm received
      await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')).toBeTruthy();
      const emittedPayment = wrapper.emitted('payment-added')?.[0]?.[0];
      expect(emittedPayment).toMatchObject({
        method: 'bank_transfer',
        amount: money(135000, 'VND'),
        ref: 'POSHQT010001',
      });
      expect(wrapper.emitted('complete')).toBeTruthy();
    });
  });

  describe('Card & Other Tabs', () => {
    it('supports card payment with optional transaction reference', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Switch to card tab
      await wrapper.find('[data-test="tab-card"]').trigger('click');
      await nextTick();

      const cardRefInput = wrapper.find('[data-test="card-ref-input"] input');
      expect(cardRefInput.exists()).toBe(true);
      await cardRefInput.setValue('TXN-987654');
      await nextTick();

      await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')?.[0]?.[0]).toMatchObject({
        method: 'card',
        amount: money(135000, 'VND'),
        ref: 'TXN-987654',
      });
    });

    it('supports other payment method with note', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Switch to other tab
      await wrapper.find('[data-test="tab-other"]').trigger('click');
      await nextTick();

      const otherNoteInput = wrapper.find('[data-test="other-note-input"] input');
      expect(otherNoteInput.exists()).toBe(true);
      await otherNoteInput.setValue('Voucher GotIt 50k');
      await nextTick();

      await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')?.[0]?.[0]).toMatchObject({
        method: 'other',
        amount: money(135000, 'VND'),
        ref: 'Voucher GotIt 50k',
      });
    });
  });

  describe('Split Payment Capability', () => {
    it('allows entering an amount smaller than balanceRemaining for partial payment', async () => {
      wrapper = mount(PaymentModal, {
        props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      // Adjust amount to pay to 50.000 (split payment)
      const amountToPayInput = wrapper.find('[data-test="amount-to-pay-input"] input');
      expect(amountToPayInput.exists()).toBe(true);
      await amountToPayInput.setValue('50000');
      await nextTick();

      // Tendered defaults to exact amount to pay or click 50k
      await wrapper.find('[data-test="denom-50k"]').trigger('click');
      await nextTick();

      expect(wrapper.find('[data-test="change-amount"]').text()).toContain('0');

      // Confirm partial payment
      await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')).toBeTruthy();
      expect(wrapper.emitted('payment-added')?.[0]?.[0]).toMatchObject({
        method: 'cash',
        amount: money(50000, 'VND'),
        tendered: money(50000, 'VND'),
        change: money(0, 'VND'),
      });

      // Since remaining balance was 135.000 and paid 50.000, 85.000 remains -> do NOT emit complete yet
      expect(wrapper.emitted('complete')).toBeFalsy();
      // Modal should not auto-close on partial payment
      expect(wrapper.emitted('update:open')).toBeFalsy();
    });

    it('emits complete and closes when a subsequent payment clears the remaining balance', async () => {
      // Bill with 85.000 remaining after earlier 50.000 payment
      const partialBill: BillDoc = {
        ...mockBill,
        balanceRemaining: money(85000, 'VND'),
        payments: [
          {
            paymentId: 'pay-1',
            method: 'cash',
            amount: money(50000, 'VND'),
            createdAt: '2026-10-23T00:00:00.000Z',
          },
        ],
      };

      wrapper = mount(PaymentModal, {
        props: { open: true, bill: partialBill, bankAccount: mockBankAccount },
        global: { plugins: [i18n] },
      });

      expect(wrapper.find('[data-test="balance-remaining"]').text()).toContain('85.000');

      // Pay the remaining 85.000 via VietQR
      await wrapper.find('[data-test="tab-vietqr"]').trigger('click');
      await nextTick();

      await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
      await nextTick();

      expect(wrapper.emitted('payment-added')?.[0]?.[0]).toMatchObject({
        method: 'bank_transfer',
        amount: money(85000, 'VND'),
      });

      expect(wrapper.emitted('complete')).toBeTruthy();
      expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    });
  });

  it('closes dialog when cancel or close button is clicked', async () => {
    wrapper = mount(PaymentModal, {
      props: { open: true, bill: mockBill, bankAccount: mockBankAccount },
      global: { plugins: [i18n] },
    });

    const closeBtn = wrapper.find('[data-test="close-modal-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });
});
