// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PosTerminal from '../PosTerminal.vue';
import SplitBillDialog from '../SplitBillDialog.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import { money } from '../../../core/money';
import type { BranchMenu } from '../../../core/catalog/menu';
import type { BillDoc } from '../../../core/order/types';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';

describe('PosTerminal.vue shell', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
  });

  it('renders terminal header with branch, terminal code, and mode switcher', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="pos-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="terminal-code"]').text()).toContain('T01');
    expect(wrapper.find('[data-test="mode-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-code"]').text()).toContain('HQ');
    expect(wrapper.find('[data-test="cashier-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="bank-settings-trigger"]').exists()).toBe(true);
  });

  it('toggles mode between floor plan and fast sale with split layout', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    // Default mode is floor
    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);

    // Switch to fast sale
    await wrapper.find('[data-test="mode-fast-sale"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);

    // Switch back to floor
    await wrapper.find('[data-test="mode-floor"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);
  });

  it('persists and restores device profile from localStorage', async () => {
    localStorage.setItem(
      'openpos_device_profile',
      JSON.stringify({ terminalCode: 'T02', cashierName: 'Lê Văn B' }),
    );

    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="terminal-code"]').text()).toContain('T02');
    const cashierInput = wrapper.find('[data-test="cashier-name"] input');
    expect(cashierInput.exists()).toBe(true);
    expect((cashierInput.element as HTMLInputElement).value).toBe('Lê Văn B');

    // Update cashier name
    await cashierInput.setValue('Nguyễn Văn A');
    await nextTick();

    const stored = JSON.parse(localStorage.getItem('openpos_device_profile') ?? '{}');
    expect(stored.cashierName).toBe('Nguyễn Văn A');
    expect(stored.terminalCode).toBe('T02');
  });

  it('emits open-bank-settings when bank settings trigger is clicked', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="bank-settings-trigger"]').trigger('click');
    expect(wrapper.emitted('open-bank-settings')).toBeTruthy();
  });

  it('opens BankSettingsModal when bank settings trigger is clicked and forwards save-bank-account', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);
    await repo.saveBankAccount({
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      updatedAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    // Click bank settings button
    await wrapper.find('[data-test="bank-settings-trigger"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="bank-settings-modal"]').exists()).toBe(true);

    // Form should have existing account number
    const accountNumInput = wrapper.find('[data-test="account-number"] input');
    expect((accountNumInput.element as HTMLInputElement).value).toBe('0901234567');

    // Update account number and save
    await accountNumInput.setValue('0988776655');
    await nextTick();

    await wrapper.find('[data-test="save-bank-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('save-bank-account')).toBeTruthy();
    const emittedAccount = wrapper.emitted('save-bank-account')?.[0]?.[0];
    expect(emittedAccount).toMatchObject({
      accountNumber: '0988776655',
      bankBin: '970422',
      accountName: 'NGUYEN VAN A',
    });

    // Verify stored in DB
    const saved = await repo.getBankAccount('hq');
    expect(saved?.accountNumber).toBe('0988776655');
  });

  it('renders floor plan tables and emits select-table when table is clicked', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);
    await repo.saveArea({
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 1',
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });
    await repo.saveTable({
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    const card = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('B01');

    await card.trigger('click');
    expect(wrapper.emitted('select-table')?.[0]).toEqual(['table:hq:t1']);
    expect((wrapper.vm as unknown as { selectedTableId: string | null }).selectedTableId).toBe('table:hq:t1');
  });

  it('renders PosCatalogPicker in fast-sale mode and propagates add-line', async () => {
    const adapter = await createMemoryAdapter();
    const mockMenu: BranchMenu = {
      branchId: 'hq',
      groups: [
        {
          category: {
            _id: 'category:cat1',
            docType: 'catalog_category',
            schemaVersion: 1,
            branchId: 'global',
            createdAt: '',
            updatedAt: '',
            name: { vi: 'Món nước', en: 'Soup' },
            sortOrder: 1,
          },
          items: [
            {
              product: {
                _id: 'product:p1',
                docType: 'catalog_product',
                schemaVersion: 1,
                branchId: 'global',
                createdAt: '',
                updatedAt: '',
                name: { vi: 'Bún chả', en: 'Bun cha' },
                categoryId: 'category:cat1',
                basePrice: money(50000, 'VND'),
                unit: 'phần',
                variants: [],
                modifierGroupIds: [],
                barcode: '893000000010',
                imageRef: null,
                sku: 'BUN-CHA',
                sortOrder: 1,
                isActive: true,
              },
              price: money(50000, 'VND'),
              priceSource: 'base',
              available: true,
              sortOrder: 1,
            },
          ],
        },
      ],
      byId: new Map(),
      byBarcode: new Map(),
      priceListId: null,
      danglingCategoryRefs: [],
    };

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq', menu: mockMenu },
      global: { plugins: [i18n] },
    });

    // Switch to fast sale mode
    await wrapper.find('[data-test="mode-fast-sale"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="pos-catalog-picker"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Bún chả');

    // Click simple product to emit add-line
    const productCard = wrapper.find('[data-product-id="product:p1"]');
    expect(productCard.exists()).toBe(true);
    await productCard.trigger('click');

    const emitted = wrapper.emitted('add-line');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      productId: 'product:p1',
      unitPriceSnapshot: money(50000, 'VND'),
    });
  });

  it('allows toggling between floor plan and catalog picker when table is selected', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);
    await repo.saveArea({
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 1',
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });
    await repo.saveTable({
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    // Select table
    await wrapper.find('[data-table-id="table:hq:t1"]').trigger('click');
    await nextTick();

    // Table ordering bar appears
    expect(wrapper.find('[data-test="table-ordering-bar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="table-ordering-bar"]').text()).toContain('t1');

    // Toggle to catalog view
    const toggleCatalogBtn = wrapper.find('[data-test="toggle-floor-catalog"]');
    expect(toggleCatalogBtn.exists()).toBe(true);
    await toggleCatalogBtn.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="pos-catalog-picker"]').exists()).toBe(true);

    // Toggle back to floor plan view
    const toggleFloorBtn = wrapper.find('[data-test="toggle-floor-tables"]');
    expect(toggleFloorBtn.exists()).toBe(true);
    await toggleFloorBtn.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="floor-plan-view"]').exists()).toBe(true);
  });

  it('renders OrderTicket in right panel when bill is provided and forwards events', async () => {
    const adapter = await createMemoryAdapter();
    const mockBill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-20261024-0001',
      paymentRef: 'POSHQT010001',
      status: 'draft',
      lines: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          nameSnapshot: { vi: 'Cà phê sữa đá', en: 'Iced Coffee' },
          unitPriceSnapshot: money(35000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(35000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(35000, 'VND'),
      payments: [],
      balanceRemaining: money(35000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(PosTerminal, {
      props: {
        adapter,
        branchId: 'hq',
        bill: mockBill,
        tableName: 'Bàn 5',
      },
      global: { plugins: [i18n] },
    });

    await nextTick();

    expect(wrapper.find('[data-test="table-name"]').text()).toContain('Bàn 5');
    expect(wrapper.text()).toContain('Cà phê sữa đá');
    expect(wrapper.text()).toContain('35.000');

    // Test checkout event forwarding
    await wrapper.find('[data-test="checkout-btn"]').trigger('click');
    expect(wrapper.emitted('checkout')).toBeTruthy();

    // Test payment modal is opened
    expect(wrapper.find('[data-test="payment-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="balance-remaining"]').text()).toContain('35.000');

    // Test print draft event forwarding
    await wrapper.find('[data-test="print-draft-btn"]').trigger('click');
    expect(wrapper.emitted('print-draft')).toBeTruthy();

    // Test quantity update forwarding
    await wrapper.find('[data-test="qty-increase-btn"]').trigger('click');
    expect(wrapper.emitted('update-line-qty')?.[0]).toEqual(['line-1', 2]);
  });

  it('handles payment modal completion and forwards payment-added and payment-complete events', async () => {
    const adapter = await createMemoryAdapter();
    const mockBill: BillDoc = {
      _id: 'bill:hq:b2',
      branchId: 'hq',
      sessionId: 'session:hq:s2',
      billNumber: 'HQ-T01-20261024-0002',
      paymentRef: 'POSHQT010002',
      status: 'draft',
      lines: [
        {
          lineId: 'line-2',
          productId: 'prod-2',
          nameSnapshot: { vi: 'Trà sen', en: 'Lotus Tea' },
          unitPriceSnapshot: money(40000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(40000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(40000, 'VND'),
      payments: [],
      balanceRemaining: money(40000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(PosTerminal, {
      props: {
        adapter,
        branchId: 'hq',
        bill: mockBill,
        tableName: 'Bàn 2',
      },
      global: { plugins: [i18n] },
    });

    await nextTick();

    // Trigger checkout
    await wrapper.find('[data-test="checkout-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="payment-modal"]').exists()).toBe(true);

    // Confirm cash payment with exact amount
    await wrapper.find('[data-test="denom-exact"]').trigger('click');
    await nextTick();

    await wrapper.find('[data-test="confirm-payment-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('payment-added')).toBeTruthy();
    expect(wrapper.emitted('payment-added')?.[0]?.[0]).toMatchObject({
      method: 'cash',
      amount: money(40000, 'VND'),
    });
    expect(wrapper.emitted('payment-complete')).toBeTruthy();

    // Verify receipt modal opens upon payment complete
    expect(wrapper.find('[data-test="receipt-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-slip"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('HQ-T01-20261024-0002');
  });

  it('opens receipt modal for draft printing when print-draft is triggered', async () => {
    const adapter = await createMemoryAdapter();
    const mockBill: BillDoc = {
      _id: 'bill:hq:b3',
      branchId: 'hq',
      sessionId: 'session:hq:s3',
      billNumber: 'HQ-T01-20261024-0003',
      paymentRef: 'POSHQT010003',
      status: 'placed',
      lines: [
        {
          lineId: 'line-3',
          productId: 'prod-3',
          nameSnapshot: { vi: 'Bạc xỉu', en: 'White Coffee' },
          unitPriceSnapshot: money(32000, 'VND'),
          qty: 2,
          modifiers: [],
          status: 'placed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(64000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(64000, 'VND'),
      payments: [],
      balanceRemaining: money(64000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(PosTerminal, {
      props: {
        adapter,
        branchId: 'hq',
        bill: mockBill,
        tableName: 'Bàn 3',
        storeInfo: { name: 'Quán Cà Phê Mở', phone: '0987654321' },
      },
      global: { plugins: [i18n] },
    });

    await nextTick();

    // Click print draft button
    await wrapper.find('[data-test="print-draft-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('print-draft')).toBeTruthy();
    expect(wrapper.find('[data-test="receipt-modal"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="receipt-slip"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Quán Cà Phê Mở');
    expect(wrapper.text()).toContain('HQ-T01-20261024-0003');
    expect(wrapper.text()).toContain('Bạc xỉu');
    expect(wrapper.find('[data-test="print-btn"]').exists()).toBe(true);
  });

  it('opens split bill dialog when split button clicked', async () => {
    const adapter = await createMemoryAdapter();
    const mockBill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-20261024-0001',
      paymentRef: 'POSHQT010001',
      status: 'draft',
      lines: [
        {
          lineId: 'line-1',
          productId: 'prod-1',
          nameSnapshot: { vi: 'Cà phê sữa đá', en: 'Iced Coffee' },
          unitPriceSnapshot: money(35000, 'VND'),
          qty: 1,
          modifiers: [],
          status: 'placed',
          addedAt: '2026-10-24T00:00:00.000Z',
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(35000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(35000, 'VND'),
      payments: [],
      balanceRemaining: money(35000, 'VND'),
      createdAt: '2026-10-24T00:00:00.000Z',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(PosTerminal, {
      props: {
        adapter,
        branchId: 'hq',
        bill: mockBill,
        tableName: 'Bàn 5',
      },
      global: { plugins: [i18n] },
    });

    await nextTick();

    expect(wrapper.findComponent(SplitBillDialog).props('open')).toBe(false);
    await wrapper.find('[data-test="split-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.findComponent(SplitBillDialog).props('open')).toBe(true);
  });
});
