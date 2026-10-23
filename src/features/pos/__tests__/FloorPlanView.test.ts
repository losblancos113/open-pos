// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FloorPlanView from '../FloorPlanView.vue';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';
import { money } from '../../../core/money';
import type { OrderRepository } from '../../../core/order/order-repository';

describe('FloorPlanView.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });

  const areas = [
    { _id: 'area:hq:a1', branchId: 'hq', name: 'Tầng 1', sortOrder: 1, createdAt: '' },
    { _id: 'area:hq:a2', branchId: 'hq', name: 'Sân vườn', sortOrder: 2, createdAt: '' },
  ];

  const tables = [
    {
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '',
    },
    {
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B02',
      name: 'Bàn 2',
      capacity: 2,
      sortOrder: 2,
      createdAt: '',
    },
    {
      _id: 'table:hq:t3',
      branchId: 'hq',
      areaId: 'area:hq:a2',
      code: 'V01',
      name: 'Vườn 1',
      capacity: 6,
      sortOrder: 1,
      createdAt: '',
    },
  ];

  it('renders area tabs and table cards with table codes', () => {
    const wrapper = mount(FloorPlanView, {
      props: {
        areas,
        tables,
        activeTableId: null,
        tableStatuses: { 'table:hq:t1': 'empty' },
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Tầng 1');
    expect(wrapper.text()).toContain('Sân vườn');
    expect(wrapper.text()).toContain('B01');
    expect(wrapper.text()).toContain('B02');
    expect(wrapper.text()).toContain('V01');
  });

  it('emits select-table when clicking a table card', async () => {
    const wrapper = mount(FloorPlanView, {
      props: {
        areas,
        tables,
        activeTableId: null,
        tableStatuses: {},
      },
      global: { plugins: [i18n] },
    });

    const card = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(card.exists()).toBe(true);
    await card.trigger('click');

    expect(wrapper.emitted('select-table')?.[0]).toEqual(['table:hq:t1']);
  });

  it('filters tables when switching area tab', async () => {
    const wrapper = mount(FloorPlanView, {
      props: {
        areas,
        tables,
        activeTableId: null,
        tableStatuses: {},
      },
      global: { plugins: [i18n] },
    });

    // Default 'all' tab shows all 3 tables
    expect(wrapper.find('[data-table-id="table:hq:t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-table-id="table:hq:t2"]').exists()).toBe(true);
    expect(wrapper.find('[data-table-id="table:hq:t3"]').exists()).toBe(true);

    // Switch to area a2 ("Sân vườn")
    const areaA2Tab = wrapper.find('[data-area-id="area:hq:a2"]');
    expect(areaA2Tab.exists()).toBe(true);
    await areaA2Tab.trigger('click');
    await nextTick();

    // Now only V01 should be visible
    expect(wrapper.find('[data-table-id="table:hq:t1"]').exists()).toBe(false);
    expect(wrapper.find('[data-table-id="table:hq:t2"]').exists()).toBe(false);
    expect(wrapper.find('[data-table-id="table:hq:t3"]').exists()).toBe(true);

    // Switch back to "Tất cả" (all)
    const allTab = wrapper.find('[data-area-id="all"]');
    expect(allTab.exists()).toBe(true);
    await allTab.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-table-id="table:hq:t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-table-id="table:hq:t2"]').exists()).toBe(true);
    expect(wrapper.find('[data-table-id="table:hq:t3"]').exists()).toBe(true);
  });

  it('renders different table statuses, capacity badge, and active session amount', () => {
    const wrapper = mount(FloorPlanView, {
      props: {
        areas,
        tables,
        activeTableId: 'table:hq:t2',
        tableStatuses: {
          'table:hq:t1': 'empty',
          'table:hq:t2': 'occupied',
          'table:hq:t3': 'bill_printed',
        },
        tableTotals: {
          'table:hq:t2': money(125000, 'VND'),
          'table:hq:t3': money(340000, 'VND'),
        },
      },
      global: { plugins: [i18n] },
    });

    const cardT1 = wrapper.find('[data-table-id="table:hq:t1"]');
    const cardT2 = wrapper.find('[data-table-id="table:hq:t2"]');
    const cardT3 = wrapper.find('[data-table-id="table:hq:t3"]');

    // Status badges
    expect(cardT1.text()).toContain('Trống');
    expect(cardT2.text()).toContain('Đang dùng');
    expect(cardT3.text()).toContain('Đã in tạm tính');

    // Capacity badges
    expect(cardT1.text()).toContain('4 khách');
    expect(cardT2.text()).toContain('2 khách');
    expect(cardT3.text()).toContain('6 khách');

    // Total amount badge
    expect(cardT2.text()).toContain('125.000');
    expect(cardT3.text()).toContain('340.000');

    // Active table indicator
    expect(cardT2.attributes('data-active')).toBeDefined();
    expect(cardT1.attributes('data-active')).toBeUndefined();
  });

  it('fetches areas and tables from orderRepository when props are not provided', async () => {
    const mockRepo: Partial<OrderRepository> = {
      getAreasAndTables: vi.fn().mockResolvedValue({
        areas: [{ _id: 'area:hq:mock1', branchId: 'hq', name: 'Khu VIP', sortOrder: 1, createdAt: '' }],
        tables: [
          {
            _id: 'table:hq:vip1',
            branchId: 'hq',
            areaId: 'area:hq:mock1',
            code: 'VIP01',
            name: 'Phòng VIP 1',
            capacity: 10,
            sortOrder: 1,
            createdAt: '',
          },
        ],
      }),
    };

    const wrapper = mount(FloorPlanView, {
      props: {
        orderRepository: mockRepo as OrderRepository,
        branchId: 'hq',
      },
      global: { plugins: [i18n] },
    });

    // Wait for async loadData in onMounted
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    await nextTick();

    expect(mockRepo.getAreasAndTables).toHaveBeenCalledWith('hq');
    expect(wrapper.text()).toContain('Khu VIP');
    expect(wrapper.text()).toContain('VIP01');
  });
});
