// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createOrderRepository } from '@/core/order/order-repository';
import { money } from '@/core/money';
import type { BillDoc } from '@/core/order/types';
import PosTerminal from '../PosTerminal.vue';
import InvoiceManagement from '@/features/reports/InvoiceManagement.vue';

describe('Payment completion to invoice paid status flow', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  const branchId = 'hq';

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);
    await repo.saveArea({
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 1',
      sortOrder: 1,
      createdAt: '2026-10-29T00:00:00.000Z',
    });
    await repo.saveTable({
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-29T00:00:00.000Z',
    });
  });

  it('marks bill as paid upon receiving payment and reflects status in receipt and invoice management', async () => {
    const mockBill: BillDoc = {
      _id: 'bill:hq:b_test_pay',
      branchId: 'hq',
      sessionId: 'session:hq:s_test_pay',
      billNumber: 'HQ-T01-20261029-9999',
      paymentRef: 'POSHQ9999',
      status: 'placed',
      lines: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          nameSnapshot: { vi: 'Cà phê trứng', en: 'Egg Coffee' },
          unitPriceSnapshot: money(45000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: new Date().toISOString(),
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(45000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(45000, 'VND'),
      payments: [],
      balanceRemaining: money(45000, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tableNameSnapshot: 'Bàn 1',
    };

    const terminalWrapper = mount(PosTerminal, {
      props: {
        adapter,
        branchId,
        bill: mockBill,
        tableName: 'Bàn 1',
      },
      global: { plugins: [i18n, vuetifyLocale] },
    });

    await nextTick();

    // 1. Click checkout button
    const checkoutBtn = terminalWrapper.find('[data-test="checkout-btn"]');
    expect(checkoutBtn.exists()).toBe(true);
    await checkoutBtn.trigger('click');
    await nextTick();

    // 2. PaymentModal opens, click exact cash denomination
    expect(terminalWrapper.find('[data-test="payment-modal"]').exists()).toBe(true);
    await terminalWrapper.find('[data-test="denom-exact"]').trigger('click');
    await nextTick();

    // 3. Click "Đã nhận tiền" (confirm payment received)
    const confirmBtn = terminalWrapper.find('[data-test="confirm-payment-btn"]');
    expect(confirmBtn.exists()).toBe(true);
    await confirmBtn.trigger('click');
    await nextTick();

    // 4. Verify payment-complete event was emitted with status: 'paid'
    const completeEmitted = terminalWrapper.emitted('payment-complete');
    expect(completeEmitted).toBeTruthy();
    const completedBill = completeEmitted?.[0]?.[0] as BillDoc;
    expect(completedBill.status).toBe('paid');
    expect(completedBill.paidAt).toBeTruthy();
    expect(completedBill.balanceRemaining.minor).toBe(0);

    // 5. Verify ReceiptModal is opened and displays status "Đã thanh toán"
    expect(terminalWrapper.find('[data-test="receipt-modal"]').exists()).toBe(true);
    const receiptStatus = terminalWrapper.find('[data-test="receipt-status"]');
    expect(receiptStatus.exists()).toBe(true);
    expect(receiptStatus.text()).toContain('Đã thanh toán');

    // 6. Verify in InvoiceManagement component that the invoice shows as "Đã thanh toán"
    const invoiceWrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: {
          _id: 'user:global:admin',
          branchId: '*',
          docType: 'user',
          schemaVersion: 1,
          username: 'admin',
          displayName: 'Quản Lý',
          role: 'manager',
          branchIds: ['hq'],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      global: { plugins: [i18n, vuetifyLocale] },
    });

    await new Promise((r) => setTimeout(r, 60));

    const invoiceRows = invoiceWrapper.findAll('[data-test="invoice-row"]');
    expect(invoiceRows.length).toBeGreaterThanOrEqual(1);

    const paidBadge = invoiceWrapper.find('[data-test="bill-status-paid"]');
    expect(paidBadge.exists()).toBe(true);
    expect(paidBadge.text()).toContain('Đã thanh toán');
    expect(invoiceWrapper.find('[data-test="bill-status-placed"]').exists()).toBe(false);
  });
});
