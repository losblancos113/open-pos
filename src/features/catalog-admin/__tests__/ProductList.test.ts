// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import ProductList from '../ProductList.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { format, money } from '@/core/money';
import { createProductDoc } from '@/core/catalog/product';
import type { ProductDoc } from '@/core/catalog/product';
import { createCategoryDoc } from '@/core/catalog/category';
import type { MenuItem } from '@/core/catalog/menu';

const t = i18n.global.t.bind(i18n.global);

const NOW = '2026-10-22T00:00:00.000Z';

const drinksCategory = createCategoryDoc({
  id: 'drinks',
  name: { vi: 'Đồ uống', en: 'Drinks' },
  now: NOW,
});

function product(id: string, vi: string, over: Partial<ProductDoc> = {}): ProductDoc {
  return {
    ...createProductDoc({
      id,
      name: { vi, en: vi },
      basePrice: money(65000, 'VND'),
      barcode: `8935001`,
      now: NOW,
    }),
    ...over,
  } as ProductDoc;
}

function item(doc: ProductDoc, over: Partial<MenuItem> = {}): MenuItem {
  return {
    product: doc,
    price: doc.basePrice,
    priceSource: 'base',
    available: true,
    sortOrder: doc.sortOrder,
    ...over,
  };
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountList(
  over: Partial<{
    items: readonly MenuItem[];
    categories: readonly (typeof drinksCategory)[];
    danglingCategoryRefs: readonly string[];
  }> = {},
): VueWrapper {
  const wrapper = mount(ProductList, {
    props: { items: [], categories: [drinksCategory], danglingCategoryRefs: [], ...over },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('ProductList', () => {
  it('renders one row per menu item', () => {
    const wrapper = mountList({
      items: [item(product('pho-bo', 'Phở bò')), item(product('tra-da', 'Trà đá'))],
    });

    expect(wrapper.findAll('[data-product-row]')).toHaveLength(2);
    expect(wrapper.text()).toContain('Phở bò');
    expect(wrapper.text()).toContain('Trà đá');
  });

  it('shows the effective price and where it comes from', () => {
    const wrapper = mountList({
      items: [
        item(product('pho-bo', 'Phở bò'), { price: money(60000, 'VND'), priceSource: 'override' }),
        item(product('tra-da', 'Trà đá'), { price: money(5000, 'VND'), priceSource: 'price_list' }),
      ],
    });

    expect(wrapper.text()).toContain(format(money(60000, 'VND')));
    expect(wrapper.text()).toContain(t('catalog.priceSource.override'));
    expect(wrapper.text()).toContain(t('catalog.priceSource.priceList'));
  });

  it('labels a base price and an unavailable product', () => {
    const wrapper = mountList({ items: [item(product('pho-chay', 'Phở chay'), { available: false })] });

    expect(wrapper.text()).toContain(t('catalog.priceSource.base'));
    expect(wrapper.text()).toContain(t('catalog.product.unavailable'));
  });

  it('shows the category name and falls back to uncategorised', () => {
    const wrapper = mountList({
      items: [
        item(product('tra-da', 'Trà đá', { categoryId: drinksCategory._id })),
        item(product('pho-bo', 'Phở bò')),
      ],
    });

    expect(wrapper.find('[data-product-row="product:tra-da"]').text()).toContain('Đồ uống');
    expect(wrapper.find('[data-product-row="product:pho-bo"]').text()).toContain(
      t('catalog.product.uncategorised'),
    );
  });

  it('warns about products pointing at a category that no longer exists', () => {
    const wrapper = mountList({
      items: [item(product('pho-bo', 'Phở bò'))],
      danglingCategoryRefs: ['product:pho-bo'],
    });

    expect(wrapper.find('[data-dangling-warning]').text()).toContain(
      t('catalog.product.danglingCategory'),
    );
    // Món vẫn phải nằm trong danh sách — mất món là lỗi tệ nhất (D6).
    expect(wrapper.findAll('[data-product-row]')).toHaveLength(1);
  });

  it('does not show the warning when every category reference resolves', () => {
    const wrapper = mountList({ items: [item(product('pho-bo', 'Phở bò'))] });

    expect(wrapper.find('[data-dangling-warning]').exists()).toBe(false);
  });

  it('shows the empty state instead of an empty table', () => {
    const wrapper = mountList();

    expect(wrapper.findAll('[data-product-row]')).toHaveLength(0);
    expect(wrapper.text()).toContain(t('catalog.product.empty'));
  });

  it('filters rows by name', async () => {
    const wrapper = mountList({
      items: [item(product('pho-bo', 'Phở bò')), item(product('tra-da', 'Trà đá'))],
    });
    await wrapper.find('[data-product-filter] input').setValue('trà');

    expect(wrapper.findAll('[data-product-row]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Trà đá');
  });

  it('filters rows by barcode', async () => {
    const wrapper = mountList({
      items: [
        item(product('pho-bo', 'Phở bò', { barcode: '8935001' })),
        item(product('tra-da', 'Trà đá', { barcode: '8935002' })),
      ],
    });
    await wrapper.find('[data-product-filter] input').setValue('8935002');

    expect(wrapper.findAll('[data-product-row]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Trà đá');
  });

  it('emits create when the user asks for a new product', async () => {
    const wrapper = mountList();
    await wrapper.find('[data-product-create]').trigger('click');

    expect(wrapper.emitted('create')).toHaveLength(1);
  });

  it('emits edit with the product id', async () => {
    const wrapper = mountList({ items: [item(product('pho-bo', 'Phở bò'))] });
    await wrapper.find('[data-product-edit="product:pho-bo"]').trigger('click');

    expect(wrapper.emitted('edit')?.[0]).toEqual(['product:pho-bo']);
  });

  it('emits remove with the product id after the confirmation', async () => {
    const wrapper = mountList({ items: [item(product('pho-bo', 'Phở bò'))] });
    await wrapper.find('[data-product-remove="product:pho-bo"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-product-remove-confirm]').trigger('click');

    expect(wrapper.emitted('remove')?.[0]).toEqual(['product:pho-bo']);
  });

  it('does not emit remove when the confirmation is cancelled', async () => {
    const wrapper = mountList({ items: [item(product('pho-bo', 'Phở bò'))] });
    await wrapper.find('[data-product-remove="product:pho-bo"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-product-remove-cancel]').trigger('click');

    expect(wrapper.emitted('remove')).toBeUndefined();
  });
});
