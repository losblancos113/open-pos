// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createInventoryRepository } from '@/core/inventory/inventory-repository';
import { createInventoryItemDoc } from '@/core/inventory/item';
import { money } from '@/core/money';
import InventoryAdminModal from '../InventoryAdminModal.vue';

describe('InventoryAdminModal.vue', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let repo: ReturnType<typeof createInventoryRepository>;
  const activeBranchId = ref('dist1');

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createInventoryRepository(adapter);

    await repo.saveItem(
      createInventoryItemDoc({
        itemId: 'ing_coffee',
        sku: 'CF-01',
        name: { vi: 'Hạt cà phê', en: 'Coffee Beans' },
        unit: 'g',
        costPerUnit: money(200, 'VND'),
        minThreshold: 500,
      }),
    );

    // Initial stock: 400g (isLowStock = true)
    await repo.recordMovement({
      _id: 'inventory_movement:dist1:init1',
      branchId: 'dist1',
      docType: 'inventory_movement',
      schemaVersion: 1,
      movementId: 'init1',
      type: 'purchase',
      itemId: 'ing_coffee',
      qtyDelta: 400,
      unit: 'g',
      actorId: 'usr1',
      createdAt: '2026-10-25T08:00:00.000Z',
    });
  });

  it('renders modal when open: true and emits close on button click', async () => {
    const wrapper = mount(InventoryAdminModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    expect(wrapper.find('[data-test="inventory-modal"]').exists()).toBe(true);

    const closeBtn = wrapper.find('[data-test="close-inventory-btn"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders KPI summary cards and stock table with low-stock badge', async () => {
    const wrapper = mount(InventoryAdminModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    // Wait for async load
    await new Promise((r) => setTimeout(r, 50));

    expect(wrapper.text()).toContain('Hạt cà phê');
    expect(wrapper.text()).toContain('CF-01');
    expect(wrapper.find('[data-test="low-stock-badge"]').exists()).toBe(true);
  });

  it('supports tab navigation between stock, waste, and stocktake', async () => {
    const wrapper = mount(InventoryAdminModal, {
      props: {
        open: true,
        repo,
        branchId: activeBranchId.value,
      },
      global: {
        plugins: [i18n, vuetifyLocale],
      },
    });

    await new Promise((r) => setTimeout(r, 50));

    const wasteTabBtn = wrapper.find('[data-test="tab-waste"]');
    expect(wasteTabBtn.exists()).toBe(true);
    await wasteTabBtn.trigger('click');

    expect(wrapper.find('[data-test="waste-form"]').exists()).toBe(true);

    const stocktakeTabBtn = wrapper.find('[data-test="tab-stocktake"]');
    expect(stocktakeTabBtn.exists()).toBe(true);
    await stocktakeTabBtn.trigger('click');

    expect(wrapper.find('[data-test="stocktake-table"]').exists()).toBe(true);
  });
});
