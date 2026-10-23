// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TableCard from '../TableCard.vue';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import { money } from '../../../core/money';
import type { TableDoc } from '../../../core/order/types';

describe('TableCard.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });

  const table: TableDoc = {
    _id: 'table:hq:t1',
    branchId: 'hq',
    areaId: 'area:hq:a1',
    code: 'B01',
    name: 'Bàn 1',
    capacity: 4,
    sortOrder: 1,
    createdAt: '2026-10-24T00:00:00.000Z',
  };

  it('renders table code, name, capacity badge, and default empty status', () => {
    const wrapper = mount(TableCard, {
      props: { table },
      global: { plugins: [i18n] },
    });

    const btn = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('B01');
    expect(btn.text()).toContain('Bàn 1');
    expect(btn.text()).toContain('4 khách');
    expect(btn.text()).toContain('Trống');
    expect(btn.attributes('data-table-id')).toBe('table:hq:t1');
    expect(btn.attributes('data-status')).toBe('empty');
    expect(btn.attributes('data-active')).toBeUndefined();
  });

  it('renders occupied status and total amount badge', () => {
    const wrapper = mount(TableCard, {
      props: {
        table,
        status: 'occupied',
        totalAmount: money(85000, 'VND'),
      },
      global: { plugins: [i18n] },
    });

    const btn = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(btn.text()).toContain('Đang dùng');
    expect(btn.attributes('data-status')).toBe('occupied');
    const total = wrapper.find('[data-test="table-total"]');
    expect(total.exists()).toBe(true);
    expect(total.text()).toContain('85.000');
  });

  it('renders bill_printed status and warning styling', () => {
    const wrapper = mount(TableCard, {
      props: {
        table,
        status: 'bill_printed',
        totalAmount: money(250000, 'VND'),
      },
      global: { plugins: [i18n] },
    });

    const btn = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(btn.text()).toContain('Đã in tạm tính');
    expect(btn.attributes('data-status')).toBe('bill_printed');
    expect(wrapper.find('[data-test="table-total"]').text()).toContain('250.000');
  });

  it('renders active visual indicator when active prop is true', () => {
    const wrapper = mount(TableCard, {
      props: {
        table,
        active: true,
      },
      global: { plugins: [i18n] },
    });

    const btn = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(btn.attributes('data-active')).toBeDefined();
    expect(btn.classes()).toContain('ring-2');
  });

  it('emits click event when clicked', async () => {
    const wrapper = mount(TableCard, {
      props: { table },
      global: { plugins: [i18n] },
    });

    const btn = wrapper.find('[data-table-id="table:hq:t1"]');
    await btn.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });
});
