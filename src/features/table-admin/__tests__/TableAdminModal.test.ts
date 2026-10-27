// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from 'vue-i18n';
import TableAdminModal from '../TableAdminModal.vue';
import viMessages from '@/i18n/vi.json';
import enMessages from '@/i18n/en.json';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createOrderRepository, type OrderRepository } from '@/core/order/order-repository';
import type { AreaDoc, TableDoc } from '@/core/order/types';

describe('TableAdminModal.vue', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'vi',
    messages: {
      vi: viMessages,
      en: enMessages,
    },
  });

  let repo: OrderRepository;

  beforeEach(async () => {
    const adapter = await createMemoryAdapter();
    repo = createOrderRepository(adapter);
    window.confirm = vi.fn().mockReturnValue(true);
  });

  it('renders title, current branch, and tab navigation', async () => {
    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        branchName: 'Chi nhánh Hội sở',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(wrapper.text()).toContain('Quản lý Bàn & Tầng');
    expect(wrapper.text()).toContain('Chi nhánh Hội sở');
    expect(wrapper.find('[data-test="tab-areas"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-tables"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="tab-batch"]').exists()).toBe(true);
  });

  it('displays empty state when no areas exist', async () => {
    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();

    expect(wrapper.find('[data-test="empty-areas-msg"]').exists()).toBe(true);
  });

  it('adds a new area and lists it', async () => {
    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();

    // Click Add Area
    await wrapper.find('[data-test="add-area-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="area-form"]').exists()).toBe(true);

    // Input name and sort order
    const nameInput = wrapper.find('[data-test="area-name-input"] input');
    await nameInput.setValue('Tầng 1');

    // Click Save
    await wrapper.find('[data-test="save-area-btn"]').trigger('click');
    await nextTick();
    await nextTick();

    // Verify area saved in repository
    const { areas } = await repo.getAreasAndTables('hq');
    expect(areas).toHaveLength(1);
    expect(areas[0]?.name).toBe('Tầng 1');

    // Verify area appears in table
    expect(wrapper.text()).toContain('Tầng 1');
    expect(wrapper.emitted('tables-updated')).toBeTruthy();
  });

  it('edits an existing area', async () => {
    const area: AreaDoc = {
      _id: 'area:hq:tang-1',
      branchId: 'hq',
      name: 'Tầng 1 Cũ',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area);

    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    expect(wrapper.text()).toContain('Tầng 1 Cũ');

    // Click Edit
    await wrapper.find('[data-test="edit-area-btn"]').trigger('click');
    await nextTick();

    const nameInput = wrapper.find('[data-test="area-name-input"] input');
    await nameInput.setValue('Tầng 1 Mới');

    await wrapper.find('[data-test="save-area-btn"]').trigger('click');
    await nextTick();
    await nextTick();

    const { areas } = await repo.getAreasAndTables('hq');
    expect(areas[0]?.name).toBe('Tầng 1 Mới');
  });

  it('prevents deleting an area with existing tables and deletes when empty', async () => {
    const area: AreaDoc = {
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Phòng VIP',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    const table: TableDoc = {
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'VIP01',
      name: 'Bàn VIP 1',
      capacity: 8,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area);
    await repo.saveTable(table);

    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    // Try deleting area with table -> blocked with error
    await wrapper.find('[data-test="delete-area-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="table-admin-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="table-admin-error"]').text()).toContain('vẫn còn 1 bàn');

    // Delete table first via repo
    await repo.deleteTable('hq', 't1');

    // Reload data in component
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await nextTick();
    await nextTick();

    // Now delete area succeeds
    await wrapper.find('[data-test="delete-area-btn"]').trigger('click');
    await nextTick();
    await nextTick();

    const { areas } = await repo.getAreasAndTables('hq');
    expect(areas).toHaveLength(0);
  });

  it('switches to tables tab and adds a new table with validation', async () => {
    const area: AreaDoc = {
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Sân vườn',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area);

    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    // Switch to tables tab
    await wrapper.find('[data-test="tab-tables"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="tables-tab-content"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="empty-tables-msg"]').exists()).toBe(true);

    // Open add table
    await wrapper.find('[data-test="add-table-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="table-form"]').exists()).toBe(true);

    // Fill form
    await wrapper.find('[data-test="table-code-input"] input').setValue('V01');
    await wrapper.find('[data-test="table-name-input"] input').setValue('Bàn Vườn 1');
    await wrapper.find('[data-test="table-capacity-input"] input').setValue('6');
    await wrapper.find('[data-test="table-shape-select"]').setValue('round');

    // Save table
    await wrapper.find('[data-test="save-table-btn"]').trigger('click');
    await nextTick();
    await nextTick();

    const { tables } = await repo.getAreasAndTables('hq');
    expect(tables).toHaveLength(1);
    expect(tables[0]?.code).toBe('V01');
    expect(tables[0]?.name).toBe('Bàn Vườn 1');
    expect(tables[0]?.capacity).toBe(6);
    expect(tables[0]?.shape).toBe('round');

    expect(wrapper.text()).toContain('V01');
    expect(wrapper.text()).toContain('Bàn Vườn 1');
  });

  it('prevents duplicate table code in the same branch', async () => {
    const area: AreaDoc = {
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Sân vườn',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    const table: TableDoc = {
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area);
    await repo.saveTable(table);

    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    await wrapper.find('[data-test="tab-tables"]').trigger('click');
    await nextTick();

    await wrapper.find('[data-test="add-table-btn"]').trigger('click');
    await nextTick();

    // Fill duplicate code
    await wrapper.find('[data-test="table-code-input"] input').setValue('B01');
    await wrapper.find('[data-test="table-name-input"] input').setValue('Bàn trùng');

    await wrapper.find('[data-test="save-table-btn"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="table-admin-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="table-admin-error"]').text()).toContain('đã tồn tại');
  });

  it('batch generates multiple tables', async () => {
    const area: AreaDoc = {
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 2',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area);

    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();
    await nextTick();

    // Switch to batch tab
    await wrapper.find('[data-test="tab-batch"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="batch-tab-content"]').exists()).toBe(true);

    // Set batch configuration: 5 tables with prefix T
    await wrapper.find('[data-test="batch-prefix-input"] input').setValue('T');
    await wrapper.find('[data-test="batch-start-index-input"] input').setValue('1');
    await wrapper.find('[data-test="batch-count-input"] input').setValue('5');
    await wrapper.find('[data-test="batch-capacity-input"] input').setValue('4');

    await nextTick();

    // Verify preview chips show T01 to T05
    const chips = wrapper.find('[data-test="batch-preview-chips"]').text();
    expect(chips).toContain('T01');
    expect(chips).toContain('T05');

    // Submit batch
    await wrapper.find('[data-test="submit-batch-btn"]').trigger('click');
    await flushPromises();

    const { tables } = await repo.getAreasAndTables('hq');
    expect(tables).toHaveLength(5);
    expect(tables.map((t) => t.code)).toEqual(['T01', 'T02', 'T03', 'T04', 'T05']);
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(TableAdminModal, {
      props: {
        open: true,
        branchId: 'hq',
        orderRepo: repo,
      },
      global: { plugins: [i18n] },
    });
    await nextTick();

    await wrapper.find('[data-test="close-modal-btn"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();

    await wrapper.find('[data-test="footer-close-btn"]').trigger('click');
    expect(wrapper.emitted('close')?.length).toBe(2);
  });
});
