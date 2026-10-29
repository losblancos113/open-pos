// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PosTerminal from '../PosTerminal.vue';
import SplitBillDialog from '../SplitBillDialog.vue';
import TransferTableDialog from '../TransferTableDialog.vue';
import MergeBillsDialog from '../MergeBillsDialog.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import { money } from '../../../core/money';
import type { BranchMenu } from '../../../core/catalog/menu';
import type { BillDoc, SessionDoc } from '../../../core/order/types';
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

    await nextTick();
    expect(wrapper.find('[data-test="order-ticket"]').exists()).toBe(true);
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

  it('isolates orders between different tables and does not leak items from previously selected table', async () => {
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
    await repo.saveTable({
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B02',
      name: 'Bàn 2',
      capacity: 2,
      sortOrder: 2,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    // 1. Select Table 1
    const vm = wrapper.vm as unknown as {
      handleSelectTable: (tid: string) => Promise<void>;
      handleAddLine: (item: any) => void;
      handleClearTableOrder: () => Promise<void>;
      handlePrintDraft: () => void;
      handlePaymentComplete: (b: any) => Promise<void>;
      effectiveBill: BillDoc | null;
      effectiveTableName: string;
      activeTableStatuses: Record<string, string>;
      activeTableTotals: Record<string, any>;
      selectedTableId: string | null;
      floorSubView: string;
    };

    await vm.handleSelectTable('table:hq:t1');
    await nextTick();
    expect(vm.selectedTableId).toBe('table:hq:t1');
    expect(vm.effectiveBill).toBeNull();

    // 2. Add line for Table 1 (2x Phở bò = 130,000 VND)
    vm.handleAddLine({
      lineId: 'line-pho',
      productId: 'prod-pho',
      nameSnapshot: { vi: 'Phở bò', en: 'Beef Pho' },
      unitPriceSnapshot: money(65000, 'VND'),
      qty: 2,
      modifiers: [],
      status: 'placed',
      addedAt: '2026-10-24T00:00:00.000Z',
    });
    await nextTick();

    expect(vm.effectiveBill).not.toBeNull();
    expect(vm.effectiveBill?.lines).toHaveLength(1);
    expect(vm.effectiveBill?.lines[0]?.nameSnapshot.vi).toBe('Phở bò');
    expect(vm.effectiveBill?.total.minor).toBe(130000);
    expect(vm.activeTableStatuses['table:hq:t1']).toBe('occupied');
    expect(vm.activeTableTotals['table:hq:t1']?.minor).toBe(130000);

    // 3. Switch to Table 2
    await vm.handleSelectTable('table:hq:t2');
    await nextTick();

    // Crucial assertion: Table 2 MUST NOT have Table 1's items!
    expect(vm.selectedTableId).toBe('table:hq:t2');
    expect(vm.effectiveBill).toBeNull();
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('empty');

    // 4. Add line for Table 2 (1x Cà phê sữa đá = 35,000 VND)
    vm.handleAddLine({
      lineId: 'line-cafe',
      productId: 'prod-cafe',
      nameSnapshot: { vi: 'Cà phê sữa đá', en: 'Iced Coffee' },
      unitPriceSnapshot: money(35000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: '2026-10-24T00:00:00.000Z',
    });
    await nextTick();

    expect(vm.effectiveBill?.lines).toHaveLength(1);
    expect(vm.effectiveBill?.lines[0]?.nameSnapshot.vi).toBe('Cà phê sữa đá');
    expect(vm.effectiveBill?.total.minor).toBe(35000);
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('occupied');
    expect(vm.activeTableTotals['table:hq:t2']?.minor).toBe(35000);

    // 5. Switch back to Table 1 -> Table 1 still has Phở bò, NOT Cà phê
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    expect(vm.effectiveBill?.lines).toHaveLength(1);
    expect(vm.effectiveBill?.lines[0]?.nameSnapshot.vi).toBe('Phở bò');
    expect(vm.effectiveBill?.total.minor).toBe(130000);
    expect(vm.effectiveTableName).toBe('Bàn 1');

    // 6. Print draft on Table 1 -> status becomes bill_printed
    vm.handlePrintDraft();
    await nextTick();
    expect(vm.activeTableStatuses['table:hq:t1']).toBe('bill_printed');

    // 7. Complete payment on Table 1 -> Table 1 freed, Table 2 remains occupied
    const paidBill = { ...vm.effectiveBill!, status: 'paid' as const, balanceRemaining: money(0, 'VND') };
    await vm.handlePaymentComplete(paidBill);
    await nextTick();

    expect(vm.activeTableStatuses['table:hq:t1']).toBe('empty');
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('occupied');

    // 8. Select Table 2 again -> Cà phê still there
    await vm.handleSelectTable('table:hq:t2');
    await nextTick();
    expect(vm.effectiveBill?.lines[0]?.nameSnapshot.vi).toBe('Cà phê sữa đá');

    // 9. Clear Table 2 order -> freed
    await vm.handleClearTableOrder();
    await nextTick();
    expect(vm.effectiveBill).toBeNull();
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('empty');
  });

  it('loads active table session from DB when table has open session', async () => {
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

    // Seed active session in DB
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 3,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
      billIds: ['bill:hq:b1'],
    };
    const bill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber: 'HQ-T01-20261024-0001',
      paymentRef: 'POSHQT010001',
      status: 'draft',
      lines: [
        {
          lineId: 'line-db-1',
          productId: 'prod-tra',
          nameSnapshot: { vi: 'Trà đào', en: 'Peach Tea' },
          unitPriceSnapshot: money(40000, 'VND'),
          qty: 2,
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
      subtotal: money(80000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(80000, 'VND'),
      payments: [],
      balanceRemaining: money(80000, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-init',
          type: 'LINE_ADDED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: bill.lines[0],
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      { session, bill },
    );

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();

    const vm = wrapper.vm as unknown as {
      handleSelectTable: (tid: string) => Promise<void>;
      effectiveBill: BillDoc | null;
      activeTableStatuses: Record<string, string>;
      activeTableTotals: Record<string, any>;
    };

    // Table 1 should automatically be recognized as occupied in floor plan from DB
    expect(vm.activeTableStatuses['table:hq:t1']).toBe('occupied');
    expect(vm.activeTableTotals['table:hq:t1']?.minor).toBe(80000);

    // Click Table 1 -> loads DB session and bill
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    expect(vm.effectiveBill).not.toBeNull();
    expect(vm.effectiveBill?.billNumber).toBe('HQ-T01-20261024-0001');
    expect(vm.effectiveBill?.lines[0]?.nameSnapshot.vi).toBe('Trà đào');
    expect(vm.effectiveBill?.total.minor).toBe(80000);
  });

  it('opens transfer table dialog and transfers table to another table', async () => {
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
    await repo.saveTable({
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B02',
      name: 'Bàn 2',
      capacity: 2,
      sortOrder: 2,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();

    const vm = wrapper.vm as any;
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    // Add line for Table 1
    vm.handleAddLine({
      lineId: 'l1',
      productId: 'p1',
      nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
      unitPriceSnapshot: money(30000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    // Ensure transfer table dialog is rendered and can open
    const transferDialog = wrapper.findComponent(TransferTableDialog);
    expect(transferDialog.exists()).toBe(true);
    expect(transferDialog.props('open')).toBe(false);

    // Click transfer table button
    await wrapper.find('[data-test="transfer-btn"]').trigger('click');
    await nextTick();
    expect(transferDialog.props('open')).toBe(true);

    // Confirm transfer to Table 2
    await vm.handleConfirmTransfer({ targetTableId: 'table:hq:t2' });
    await nextTick();

    // After transfer: Table 1 empty, Table 2 occupied
    expect(vm.selectedTableId).toBe('table:hq:t2');
    expect(vm.activeTableStatuses['table:hq:t1']).toBe('empty');
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('occupied');
    expect(vm.effectiveBill?.total.minor).toBe(30000);
  });

  it('shows multiple active bills in merge dialog and merges them successfully', async () => {
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
    await repo.saveTable({
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B02',
      name: 'Bàn 2',
      capacity: 2,
      sortOrder: 2,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 30));
    await nextTick();

    const vm = wrapper.vm as any;

    // 1. Order on Table 1 (50,000 VND)
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();
    vm.handleAddLine({
      lineId: 'l1',
      productId: 'p1',
      nameSnapshot: { vi: 'Phở bò', en: 'Beef pho' },
      unitPriceSnapshot: money(50000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    // 2. Order on Table 2 (30,000 VND)
    await vm.handleSelectTable('table:hq:t2');
    await nextTick();
    vm.handleAddLine({
      lineId: 'l2',
      productId: 'p2',
      nameSnapshot: { vi: 'Trà đào', en: 'Peach tea' },
      unitPriceSnapshot: money(30000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    // Switch back to Table 1
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    const mergeDialog = wrapper.findComponent(MergeBillsDialog);
    expect(mergeDialog.exists()).toBe(true);

    // Merge dialog bills MUST contain both bills!
    const billsProp = mergeDialog.props('bills') as BillDoc[];
    expect(billsProp).toHaveLength(2);

    // Click merge button to open dialog
    await wrapper.find('[data-test="merge-btn"]').trigger('click');
    await nextTick();
    expect(mergeDialog.props('open')).toBe(true);

    // Confirm merge of both bills
    const billIds = billsProp.map((b) => b._id);
    await vm.handleConfirmMerge({ billIds });
    await nextTick();

    // Table 1 now has both items (50k + 30k = 80k)
    expect(vm.effectiveBill?.lines).toHaveLength(2);
    expect(vm.effectiveBill?.total.minor).toBe(80000);

    // Table 2 is now cleared
    expect(vm.activeTableStatuses['table:hq:t2']).toBe('empty');
  });

  it('confirms order items to kitchen and persists them to the repository', async () => {
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

    const vm = wrapper.vm as unknown as {
      handleSelectTable: (tid: string) => Promise<void>;
      handleAddLine: (item: any) => void;
      handleConfirmOrder: () => Promise<void>;
      effectiveBill: BillDoc | null;
      selectedTableId: string | null;
    };

    // 1. Select table and add item
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    vm.handleAddLine({
      lineId: 'line-unconfirmed',
      productId: 'prod-bun',
      nameSnapshot: { vi: 'Bún bò', en: 'Beef Noodle' },
      unitPriceSnapshot: money(50000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    // Line should initially be unconfirmed
    expect(vm.effectiveBill?.lines[0]?.kdsStatus).toBe('unconfirmed');

    // 2. Confirm order and send to kitchen
    await vm.handleConfirmOrder();
    await nextTick();

    // Line should now be pending
    expect(vm.effectiveBill?.lines[0]?.kdsStatus).toBe('pending');
    expect(wrapper.emitted('confirm-order')).toBeTruthy();

    // Verify session is persisted in DB so KDS sees it
    const activeSession = await repo.getActiveSession('hq', 'table:hq:t1');
    expect(activeSession).not.toBeNull();
    expect(activeSession?.bill.lines[0]?.kdsStatus).toBe('pending');
  });

  it('allows calling additional items on a table without merging into confirmed items', async () => {
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

    const vm = wrapper.vm as unknown as {
      handleSelectTable: (tid: string) => Promise<void>;
      handleAddLine: (item: any) => void;
      handleConfirmOrder: () => Promise<void>;
      effectiveBill: BillDoc | null;
      effectiveSession: SessionDoc | null;
    };

    // 1. Order round 1: 1x Phở bò
    await vm.handleSelectTable('table:hq:t1');
    await nextTick();

    vm.handleAddLine({
      lineId: 'line-r1',
      productId: 'prod-pho',
      nameSnapshot: { vi: 'Phở bò', en: 'Beef Pho' },
      unitPriceSnapshot: money(60000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    await vm.handleConfirmOrder();
    await nextTick();
    expect(vm.effectiveBill?.lines[0]?.kdsStatus).toBe('pending');

    // 2. Kitchen starts preparing round 1 item
    await repo.updateLineKdsStatus('hq', vm.effectiveSession!._id, vm.effectiveBill!._id, 'line-r1', 'preparing', 'Chef', 'KDS');

    // 3. Customer calls MORE of the same dish (1x Phở bò again)
    vm.handleAddLine({
      lineId: 'line-r2',
      productId: 'prod-pho',
      nameSnapshot: { vi: 'Phở bò', en: 'Beef Pho' },
      unitPriceSnapshot: money(60000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    });
    await nextTick();

    // Crucial requirement: Must NOT merge into line-r1 which is already cooking!
    expect(vm.effectiveBill?.lines).toHaveLength(2);
    expect(vm.effectiveBill?.lines[0]?.lineId).toBe('line-r1');
    expect(vm.effectiveBill?.lines[0]?.qty).toBe(1);
    expect(vm.effectiveBill?.lines[1]?.lineId).toBe('line-r2');
    expect(vm.effectiveBill?.lines[1]?.qty).toBe(1);
    expect(vm.effectiveBill?.lines[1]?.kdsStatus).toBe('unconfirmed');

    // 4. Confirm additional round
    await vm.handleConfirmOrder();
    await nextTick();

    expect(vm.effectiveBill?.lines[1]?.kdsStatus).toBe('pending');
    expect(vm.effectiveBill?.total.minor).toBe(120000);

    // Verify DB state has both lines
    const activeSession = await repo.getActiveSession('hq', 'table:hq:t1');
    expect(activeSession?.bill.lines).toHaveLength(2);
  });
});
