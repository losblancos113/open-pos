// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { money } from '@/core/money';
import type { UserDoc } from '@/core/auth/types';
import type { BillDoc } from '@/core/order/types';
import InvoiceManagement from '../InvoiceManagement.vue';

describe('InvoiceManagement.vue', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  const branchId = 'hq';

  const adminUser: UserDoc = {
    _id: 'user:global:admin',
    branchId: '*',
    docType: 'user',
    schemaVersion: 1,
    username: 'admin',
    displayName: 'Quản Lý Cửa Hàng',
    role: 'manager',
    branchIds: ['hq'],
    isActive: true,
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  };

  const cashierUser: UserDoc = {
    _id: 'user:global:cashier',
    branchId: '*',
    docType: 'user',
    schemaVersion: 1,
    username: 'cashier1',
    displayName: 'Thu Ngân 1',
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z',
  };

  const sampleBill: BillDoc = {
    _id: 'bill:hq:b01',
    branchId: 'hq',
    sessionId: 's01',
    billNumber: 'HQ-T01-20261029-0001',
    paymentRef: 'POSHQ0001',
    status: 'paid',
    lines: [
      {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Trà sen vàng', en: 'Lotus Tea' },
        unitPriceSnapshot: money(45000, 'VND'),
        qty: 2,
        status: 'placed',
        addedAt: new Date().toISOString(),
        modifiers: [],
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(90000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(90000, 'VND'),
    payments: [
      {
        paymentId: 'pay1',
        method: 'cash',
        amount: money(90000, 'VND'),
        createdAt: new Date().toISOString(),
      },
    ],
    balanceRemaining: money(0, 'VND'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    paidAt: new Date().toISOString(),
    tableNameSnapshot: 'Bàn 3',
  };

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    await adapter.put({ ...sampleBill, docType: 'bill', schemaVersion: 1 } as any);
  });

  it('renders invoice table using Vuetify0 DataTable and displays bill', async () => {
    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: adminUser,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(wrapper.find('[data-test="invoice-management-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="invoice-search-input"]').exists()).toBe(true);

    const rows = wrapper.findAll('[data-test="invoice-row"]');
    expect(rows.length).toBe(1);
    expect(rows[0]?.text()).toContain('HQ-T01-20261029-0001');
    expect(rows[0]?.text()).toContain('Bàn 3');
  });

  it('opens bill detail modal and displays items and totals', async () => {
    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: adminUser,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    const viewBtn = wrapper.find('[data-test="view-invoice-btn"]');
    expect(viewBtn.exists()).toBe(true);
    await viewBtn.trigger('click');

    expect(wrapper.find('[data-test="invoice-detail-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="invoice-detail-modal"]').text()).toContain('Trà sen vàng');
    expect(wrapper.find('[data-test="invoice-detail-modal"]').text()).toContain('Bàn 3');
  });

  it('hides edit and void options from cashier role', async () => {
    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: cashierUser, // cashier role
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    // Cashier can view
    expect(wrapper.find('[data-test="view-invoice-btn"]').exists()).toBe(true);

    // Cashier cannot void or edit
    expect(wrapper.find('[data-test="void-invoice-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="edit-invoice-note-btn"]').exists()).toBe(false);
  });

  it('allows manager/admin to void invoice with a reason', async () => {
    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: adminUser, // manager/admin role
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    const voidBtn = wrapper.find('[data-test="void-invoice-btn"]');
    expect(voidBtn.exists()).toBe(true);
    await voidBtn.trigger('click');

    // Dialog opens
    expect(wrapper.find('[data-test="void-invoice-dialog"]').exists()).toBe(true);

    // Enter void reason
    const reasonInput = wrapper.find('[data-test="void-reason-input"] input');
    await reasonInput.setValue('Khách đổi ý thanh toán lại');

    // Confirm void
    const confirmBtn = wrapper.find('[data-test="confirm-void-btn"]');
    await confirmBtn.trigger('click');

    await new Promise((r) => setTimeout(r, 60));

    // Check status in DB
    const updated = await adapter.get('bill:hq:b01');
    expect((updated as any).status).toBe('voided');
    expect((updated as any).voidReason).toBe('Khách đổi ý thanh toán lại');
    expect((updated as any).voidedBy).toBe('Quản Lý Cửa Hàng');
  });

  it('opens thermal receipt modal when clicking reprint in detail modal and in row', async () => {
    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: cashierUser,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    // 1. Open detail modal
    await wrapper.find('[data-test="view-invoice-btn"]').trigger('click');
    expect(wrapper.find('[data-test="invoice-detail-modal"]').exists()).toBe(true);

    // 2. Click reprint button in detail modal
    const reprintBtn = wrapper.find('[data-test="detail-reprint-btn"]');
    expect(reprintBtn.exists()).toBe(true);
    await reprintBtn.trigger('click');
    await nextTick();
    await new Promise((r) => setTimeout(r, 60));

    // 3. ReceiptModal opens and emits reprint
    expect(wrapper.emitted('reprint')).toBeTruthy();
    expect(wrapper.find('[data-test="receipt-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-slip"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-slip"]').text()).toContain('HQ-T01-20261029-0001');

    // Close receipt modal
    await wrapper.find('[data-test="close-receipt-btn"]').trigger('click');
    await nextTick();

    // 4. Test row reprint button directly
    const rowReprintBtn = wrapper.find('[data-test="row-reprint-btn"]');
    expect(rowReprintBtn.exists()).toBe(true);
    await rowReprintBtn.trigger('click');
    await nextTick();
    await new Promise((r) => setTimeout(r, 60));

    expect(wrapper.find('[data-test="receipt-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-slip"]').exists()).toBe(true);
  });

  it('displays resolved table name when bill document does not have tableNameSnapshot stored', async () => {
    // Seed Table
    await adapter.put({
      _id: `table:${branchId}:t07`,
      branchId,
      docType: 'table',
      name: 'Bàn Ngoài Trời 7',
      code: 'T07',
    } as any);

    // Seed Session with tableIds
    await adapter.put({
      _id: `session:${branchId}:sess_outdoor`,
      branchId,
      docType: 'session',
      tableIds: [`table:${branchId}:t07`],
      billIds: [`bill:${branchId}:b_outdoor`],
      status: 'closed',
    } as any);

    // Seed Bill with NO tableNameSnapshot
    await adapter.put({
      _id: `bill:${branchId}:b_outdoor`,
      branchId,
      sessionId: 'sess_outdoor',
      billNumber: 'HQ-T01-20261029-9999',
      paymentRef: 'POSHQ9999',
      status: 'paid',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(80000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(80000, 'VND'),
      payments: [
        {
          paymentId: 'pay_out',
          method: 'cash',
          amount: money(80000, 'VND'),
          createdAt: new Date().toISOString(),
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paidAt: new Date().toISOString(),
      docType: 'bill',
    } as any);

    const wrapper = mount(InvoiceManagement, {
      props: {
        adapter,
        branchId,
        currentUser: adminUser,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    // The outdoor bill should display 'Bàn Ngoài Trời 7', not 'Mang về / Bán nhanh'
    const rows = wrapper.findAll('[data-test="invoice-row"]');
    const outdoorRow = rows.find((r) => r.text().includes('HQ-T01-20261029-9999'));
    expect(outdoorRow).toBeDefined();
    expect(outdoorRow?.text()).toContain('Bàn Ngoài Trời 7');
    expect(outdoorRow?.text()).not.toContain('Mang về / Bán nhanh');
  });
});
