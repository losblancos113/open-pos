// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicList from '../DynamicList.vue';
import { i18n } from '@/i18n';
import type { TypeDefinition } from '@/core/types/definition';
import { money } from '@/core/money';

const def: TypeDefinition = {
  key: 'product',
  kind: 'builtin_ext',
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  version: 1,
  listView: ['name', 'price', 'cost'],
  fields: [
    { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
    { key: 'price', label: { vi: 'Giá', en: 'Price' }, dataType: 'money', required: false },
    {
      key: 'cost',
      label: { vi: 'Vốn', en: 'Cost' },
      dataType: 'formula',
      required: false,
      formula: 'price * 0.6',
    },
  ],
};

function mountList(records: readonly Record<string, unknown>[] = []) {
  return mount(DynamicList, {
    props: { definition: def, records, locale: 'vi' as const },
    global: { plugins: [i18n] },
  });
}

describe('DynamicList', () => {
  it('renders one column header per listView entry', () => {
    const wrapper = mountList();
    expect(wrapper.findAll('th')).toHaveLength(3);
  });

  it('labels each header from the field label in the active locale', () => {
    const wrapper = mountList();
    expect(wrapper.findAll('th').map((th) => th.text().trim())).toEqual([
      'Tên',
      'Giá',
      'Vốn (Tự tính)',
    ]);
  });

  it('renders a row per record', () => {
    const wrapper = mountList([{ _id: 'product:p1', name: 'Phở', price: money(69000, 'VND') }]);
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.text()).toContain('Phở');
  });

  it('shows the computed column value', () => {
    const wrapper = mountList([{ _id: 'product:p1', name: 'Phở', price: money(100000, 'VND') }]);
    expect(wrapper.text()).toContain('60');
  });

  it('shows the empty state when there are no records', () => {
    const wrapper = mountList();
    expect(wrapper.text()).toContain(i18n.global.t('type.list.empty'));
  });

  it('does not render an empty state row when there are records', () => {
    const wrapper = mountList([{ _id: 'product:p1', name: 'Phở', price: money(69000, 'VND') }]);
    expect(wrapper.text()).not.toContain(i18n.global.t('type.list.empty'));
  });
});
