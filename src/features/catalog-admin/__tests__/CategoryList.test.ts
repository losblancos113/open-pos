// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import CategoryList from '../CategoryList.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createCategoryDoc } from '@/core/catalog/category';
import type { CategoryDoc } from '@/core/catalog/category';

const t = i18n.global.t.bind(i18n.global);

function category(id: string, vi: string, en: string, sortOrder = 0): CategoryDoc {
  return createCategoryDoc({
    id,
    name: { vi, en },
    sortOrder,
    now: '2026-10-22T00:00:00.000Z',
  });
}

const mounted: VueWrapper[] = [];

/**
 * Tháo từng wrapper sau mỗi test: `AlertDialog` đăng ký một ticket vào stack overlay
 * toàn cục của Vuetify0, và ticket cũ còn nằm lại sẽ làm lần mount sau cảnh báo trùng id.
 */
afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountList(categories: readonly CategoryDoc[] = []): VueWrapper {
  const wrapper = mount(CategoryList, {
    props: { categories },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('CategoryList', () => {
  it('renders one row per category', () => {
    const wrapper = mountList([
      category('drinks', 'Đồ uống', 'Drinks'),
      category('main', 'Món chính', 'Main dishes'),
    ]);

    expect(wrapper.findAll('[data-category-row]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Đồ uống');
    expect(wrapper.text()).toContain('Món chính');
  });

  it('shows the empty state instead of an empty table', () => {
    const wrapper = mountList();

    expect(wrapper.findAll('[data-category-row]')).toHaveLength(0);
    expect(wrapper.text()).toContain(t('catalog.category.empty'));
  });

  it('does not show the empty state while categories exist', () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks')]);

    expect(wrapper.text()).not.toContain(t('catalog.category.empty'));
  });

  it('emits create with the typed name and sort order', async () => {
    const wrapper = mountList();
    await wrapper.find('[data-category-name] input').setValue('Đồ uống');
    await wrapper.find('[data-category-sort-order] input').setValue('2');
    await wrapper.find('[data-category-form]').trigger('submit');

    expect(wrapper.emitted('create')?.[0]).toEqual([{ vi: 'Đồ uống', en: 'Đồ uống' }, 2]);
  });

  it('uses the English name when one is typed', async () => {
    const wrapper = mountList();
    await wrapper.find('[data-category-name] input').setValue('Đồ uống');
    await wrapper.find('[data-category-name-en] input').setValue('Drinks');
    await wrapper.find('[data-category-form]').trigger('submit');

    expect(wrapper.emitted('create')?.[0]).toEqual([{ vi: 'Đồ uống', en: 'Drinks' }, 0]);
  });

  it('does not emit create while the name is empty', async () => {
    const wrapper = mountList();
    await wrapper.find('[data-category-form]').trigger('submit');

    expect(wrapper.emitted('create')).toBeUndefined();
    // Thông báo lấy từ `validateLocalizedName` của core, không phải luật tự viết ở UI.
    expect(wrapper.text()).toContain(t('catalog.category.nameRequired'));
  });

  it('loads an existing category into the form and emits update with its id', async () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks', 1)]);
    await wrapper.find('[data-category-edit="category:drinks"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-category-name] input').setValue('Nước uống');
    await wrapper.find('[data-category-form]').trigger('submit');

    expect(wrapper.emitted('update')?.[0]).toEqual([
      'category:drinks',
      { name: { vi: 'Nước uống', en: 'Drinks' }, sortOrder: 1 },
    ]);
    expect(wrapper.emitted('create')).toBeUndefined();
  });

  it('leaves edit mode after saving', async () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks')]);
    await wrapper.find('[data-category-edit="category:drinks"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-category-cancel]').exists()).toBe(true);

    await wrapper.find('[data-category-form]').trigger('submit');
    await nextTick();

    expect(wrapper.find('[data-category-cancel]').exists()).toBe(false);
  });

  it('emits remove with the category id after the confirmation', async () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks')]);
    await wrapper.find('[data-category-remove="category:drinks"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-category-remove-confirm]').trigger('click');

    expect(wrapper.emitted('remove')?.[0]).toEqual(['category:drinks']);
  });

  it('does not emit remove when the confirmation is cancelled', async () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks')]);
    await wrapper.find('[data-category-remove="category:drinks"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-category-remove-cancel]').trigger('click');

    expect(wrapper.emitted('remove')).toBeUndefined();
  });

  it('names the category being removed in the confirmation', async () => {
    const wrapper = mountList([category('drinks', 'Đồ uống', 'Drinks')]);
    await wrapper.find('[data-category-remove="category:drinks"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-category-remove-dialog]').text()).toContain('Đồ uống');
  });
});
