// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { money } from '@/core/money';
import type { BillDoc } from '@/core/order/types';
import StoreReportsModal from '../StoreReportsModal.vue';

describe('StoreReportsModal.vue', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  const activeBranchId = ref('hq');

  beforeEach(async () => {
    adapter = await createMemoryAdapter();

    // Seed sample product and bill
    await adapter.put({
      _id: 'product:p1',
      branchId: '*',
      docType: 'catalog_product',
      productId: 'p1',
      categoryId: 'cat_coffee',
      name: { vi: 'Cà phê', en: 'Coffee' },
    } as any);

    await adapter.put({
      _id: 'category:cat_coffee',
      branchId: '*',
      docType: 'catalog_category',
      categoryId: 'cat_coffee',
      name: { vi: 'Cà phê', en: 'Coffee' },
    } as any);

    const bill: BillDoc = {
      _id: 'bill:hq:b01',
      branchId: 'hq',
      sessionId: 's01',
      billNumber: 'B-01',
      paymentRef: 'P-01',
      status: 'paid',
      lines: [
        {
          lineId: 'l1',
          productId: 'p1',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(35000, 'VND'),
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
      subtotal: money(70000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(70000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(70000, 'VND'),
          tendered: money(70000, 'VND'),
          change: money(0, 'VND'),
          createdAt: new Date().toISOString(),
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await adapter.put(bill as unknown as any);
  });

  it('renders modal when open: true and emits close on button click', async () => {
    const wrapper = mount(StoreReportsModal, {
      props: {
        open: true,
        adapter,
        branchId: activeBranchId.value,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    expect(wrapper.find('[data-test="store-reports-modal"]').exists()).toBe(true);

    const closeBtn = wrapper.find('[data-test="close-reports-modal-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders Invoices tab by default and supports tab switching to Z-Report, Categories, Hourly, Payments', async () => {
    const wrapper = mount(StoreReportsModal, {
      props: {
        open: true,
        adapter,
        branchId: activeBranchId.value,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 60));

    // Default tab is Invoices
    expect(wrapper.find('[data-test="invoices-panel"]').exists()).toBe(true);

    // Switch to Z-Report tab
    const zReportTabBtn = wrapper.find('[data-test="tab-zreport"]');
    expect(zReportTabBtn.exists()).toBe(true);
    await zReportTabBtn.trigger('click');

    expect(wrapper.find('[data-test="z-report-panel"]').exists()).toBe(true);

    // Switch to Categories tab
    const catTabBtn = wrapper.find('[data-test="tab-categories"]');
    expect(catTabBtn.exists()).toBe(true);
    expect(catTabBtn.text()).toContain('Báo cáo theo danh mục');
    await catTabBtn.trigger('click');

    expect(wrapper.find('[data-test="categories-panel"]').exists()).toBe(true);

    // Switch to Hourly tab
    const hourlyTabBtn = wrapper.find('[data-test="tab-hourly"]');
    expect(hourlyTabBtn.exists()).toBe(true);
    await hourlyTabBtn.trigger('click');

    expect(wrapper.find('[data-test="hourly-panel"]').exists()).toBe(true);

    // Switch to Payments tab
    const paymentsTabBtn = wrapper.find('[data-test="tab-payments"]');
    expect(paymentsTabBtn.exists()).toBe(true);
    await paymentsTabBtn.trigger('click');

    expect(wrapper.find('[data-test="payments-panel"]').exists()).toBe(true);
  });

  it('renders Category Report (Báo cáo theo danh mục) with KPI cards, item breakdown and search filter', async () => {
    const wrapper = mount(StoreReportsModal, {
      props: {
        open: true,
        adapter,
        branchId: activeBranchId.value,
        initialTab: 'categories',
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 80));

    expect(wrapper.find('[data-test="categories-panel"]').exists()).toBe(true);

    // Overview cards
    const countCard = wrapper.find('[data-test="total-categories-count"]');
    expect(countCard.exists()).toBe(true);
    expect(countCard.text()).toBe('1');

    const qtyCard = wrapper.find('[data-test="total-categories-qty"]');
    expect(qtyCard.exists()).toBe(true);
    expect(qtyCard.text()).toBe('2');

    const revCard = wrapper.find('[data-test="total-categories-revenue"]');
    expect(revCard.exists()).toBe(true);
    expect(revCard.text()).toContain('70.000');

    const topCard = wrapper.find('[data-test="top-category-name"]');
    expect(topCard.exists()).toBe(true);
    expect(topCard.text()).toContain('Cà phê');

    // Toggle expand items breakdown
    expect(wrapper.find('[data-test="cat-items-row-cat_coffee"]').exists()).toBe(false);

    const toggleBtn = wrapper.find('[data-test="toggle-items-cat_coffee"]');
    expect(toggleBtn.exists()).toBe(true);
    await toggleBtn.trigger('click');

    // Now expanded
    const itemsRow = wrapper.find('[data-test="cat-items-row-cat_coffee"]');
    expect(itemsRow.exists()).toBe(true);

    const itemRow = wrapper.find('[data-test="cat-item-p1"]');
    expect(itemRow.exists()).toBe(true);
    expect(itemRow.text()).toContain('Cà phê');
    expect(itemRow.text()).toContain('2');
    expect(itemRow.text()).toContain('70.000');
    expect(itemRow.text()).toContain('100%');

    // Toggle collapse
    await toggleBtn.trigger('click');
    expect(wrapper.find('[data-test="cat-items-row-cat_coffee"]').exists()).toBe(false);

    // Search filter
    const searchInput = wrapper.find('[data-test="category-search-input"] input');
    if (searchInput.exists()) {
      await searchInput.setValue('Trà');
      // Should show empty state
      expect(wrapper.text()).toContain('Chưa có');

      await searchInput.setValue('Cà phê');
      expect(wrapper.find('[data-test="toggle-items-cat_coffee"]').exists()).toBe(true);
    }
  });
});
