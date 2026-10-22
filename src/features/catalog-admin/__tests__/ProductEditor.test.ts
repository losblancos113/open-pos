// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import ProductEditor from '../ProductEditor.vue';
import type { ProductFormValue } from '../ProductEditor.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { money } from '@/core/money';
import { createProductDoc } from '@/core/catalog/product';
import type { ProductRecord } from '@/core/catalog/product';
import { createCategoryDoc } from '@/core/catalog/category';
import { createModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { TypeDefinition } from '@/core/types/definition';

const t = i18n.global.t.bind(i18n.global);

const NOW = '2026-10-22T00:00:00.000Z';

const mainCategory = createCategoryDoc({
  id: 'main',
  name: { vi: 'Món chính', en: 'Main dishes' },
  now: NOW,
});

const toppings = createModifierGroupDoc({
  id: 'topping',
  name: { vi: 'Topping', en: 'Toppings' },
  options: [{ id: 'trung', name: { vi: 'Trứng', en: 'Egg' }, priceDelta: money(5000, 'VND') }],
  now: NOW,
});

/** Type `product` của M1 với một field tuỳ chỉnh bắt buộc — đúng cách catalog mở rộng. */
const productType: TypeDefinition = {
  key: 'product',
  kind: 'builtin_ext',
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  version: 1,
  listView: [],
  fields: [
    {
      key: 'spicy_level',
      label: { vi: 'Độ cay', en: 'Spicy level' },
      dataType: 'number',
      required: true,
    },
  ],
};

/** `ProductRecord` = `ProductDoc` + field tuỳ chỉnh, nên fixture phải thêm khoá động. */
function productRecord(): ProductRecord {
  return {
    ...createProductDoc({
      id: 'pho-bo',
      name: { vi: 'Phở bò', en: 'Beef pho' },
      basePrice: money(65000, 'VND'),
      categoryId: mainCategory._id,
      unit: 'tô',
      variants: [
        { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-10000, 'VND') },
        { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
      ],
      modifierGroupIds: [toppings._id],
      barcode: '8935001',
      sku: 'PHO-BO',
      sortOrder: 1,
      isActive: true,
      now: NOW,
    }),
    spicy_level: 2,
  } as unknown as ProductRecord;
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountEditor(over: Partial<{ product: ProductRecord | null; productType: TypeDefinition | null }> = {}): VueWrapper {
  const wrapper = mount(ProductEditor, {
    props: {
      categories: [mainCategory],
      modifierGroups: [toppings],
      product: null,
      productType,
      ...over,
    },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function inputValue(wrapper: VueWrapper, selector: string): string | undefined {
  const element = wrapper.find(selector).element as HTMLInputElement | undefined;
  return element?.value;
}

/**
 * Ô số của Vuetify0 hiển thị giá trị đã format theo locale ("65.000"), nên con số thật
 * đọc ở `aria-valuenow` — đó mới là thứ được đưa vào `Money`.
 */
function numericValue(wrapper: VueWrapper, selector: string): string | null {
  return wrapper.find(selector).attributes('aria-valuenow') ?? null;
}

/** Payload của lần `save` đầu tiên — `emitted` trả `unknown` nên ép kiểu ở đúng ranh giới test. */
function savedValue(wrapper: VueWrapper): ProductFormValue {
  return wrapper.emitted('save')?.[0]?.[0] as ProductFormValue;
}

describe('ProductEditor', () => {
  it('fills the system fields from the product being edited', () => {
    const wrapper = mountEditor({ product: productRecord() });

    expect(inputValue(wrapper, '[data-product-name] input')).toBe('Phở bò');
    expect(inputValue(wrapper, '[data-product-name-en] input')).toBe('Beef pho');
    expect(numericValue(wrapper, '[data-product-price] input')).toBe('65000');
    expect(inputValue(wrapper, '[data-product-barcode] input')).toBe('8935001');
    expect(inputValue(wrapper, '[data-product-unit] input')).toBe('tô');
    expect(wrapper.findAll('[data-variant-row]')).toHaveLength(2);
    expect(inputValue(wrapper, '[data-variant-id] input')).toBe('size-s');
  });

  it('shows the custom field values coming from the product record', () => {
    const wrapper = mountEditor({ product: productRecord() });

    expect(numericValue(wrapper, '[data-field="spicy_level"] input')).toBe('2');
  });

  it('emits save with a Money built from the typed price', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    await wrapper.find('[data-product-price] input').setValue('72000');
    await wrapper.find('[data-product-form]').trigger('submit');

    const saved = savedValue(wrapper);
    expect(saved.basePrice).toEqual(money(72000, 'VND'));
  });

  it('does not turn a typed price into a float', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    // Người Việt gõ "72.000": ô giá theo locale `vi` phải hiểu đúng 72000, không phải 72.
    await wrapper.find('[data-product-price] input').setValue('72.000');
    await wrapper.find('[data-product-form]').trigger('submit');

    const saved = savedValue(wrapper);
    expect(saved.basePrice).toEqual(money(72000, 'VND'));
    expect(Number.isInteger(saved.basePrice.minor)).toBe(true);
  });

  it('adds and removes a variant row', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    expect(wrapper.findAll('[data-variant-row]')).toHaveLength(2);

    await wrapper.find('[data-variant-add]').trigger('click');
    expect(wrapper.findAll('[data-variant-row]')).toHaveLength(3);

    await wrapper.findAll('[data-variant-remove]')[1]?.trigger('click');
    expect(wrapper.findAll('[data-variant-row]')).toHaveLength(2);
  });

  it('emits save with the variant deltas as Money', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    await wrapper.find('[data-product-form]').trigger('submit');

    expect(savedValue(wrapper).variants).toEqual([
      { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-10000, 'VND') },
      { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
    ]);
  });

  it('renders the M1 custom fields through the type definition', () => {
    const wrapper = mountEditor({ product: productRecord() });

    expect(wrapper.find('[data-field="spicy_level"]').exists()).toBe(true);
  });

  it('does not save while a required custom field is empty', async () => {
    const wrapper = mountEditor({ product: null, productType });
    await wrapper.find('[data-product-name] input').setValue('Phở chay');
    await wrapper.find('[data-product-price] input').setValue('55000');
    await wrapper.find('[data-product-form]').trigger('submit');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.text()).toContain(t('type.record.required'));
  });

  it('keeps custom field values when a system field changes', async () => {
    const wrapper = mountEditor({ product: productRecord(), productType });
    await wrapper.find('[data-field="spicy_level"] input').setValue('3');
    await wrapper.find('[data-product-name] input').setValue('Phở bò đặc biệt');
    await wrapper.find('[data-product-form]').trigger('submit');

    const saved = savedValue(wrapper);
    expect(saved.name).toEqual({ vi: 'Phở bò đặc biệt', en: 'Beef pho' });
    expect(saved.customFields).toEqual({ spicy_level: 3 });
  });

  it('emits cancel without saving', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    await wrapper.find('[data-product-cancel]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('refuses a duplicate variant id instead of letting the repository fail later', async () => {
    const wrapper = mountEditor({ product: productRecord() });
    await wrapper.findAll('[data-variant-id] input')[1]?.setValue('size-s');
    await wrapper.find('[data-product-form]').trigger('submit');

    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('falls back to the Vietnamese variant name when the English one is empty', async () => {
    const wrapper = mountEditor({ product: null, productType: null });
    await wrapper.find('[data-product-name] input').setValue('Trà đá');
    await wrapper.find('[data-product-price] input').setValue('5000');
    await wrapper.find('[data-variant-add]').trigger('click');
    await wrapper.find('[data-variant-id] input').setValue('ly-lon');
    await wrapper.find('[data-variant-name] input').setValue('Ly lớn');
    await nextTick();
    await wrapper.find('[data-product-form]').trigger('submit');

    expect(savedValue(wrapper).variants).toEqual([
      { id: 'ly-lon', name: { vi: 'Ly lớn', en: 'Ly lớn' }, priceDelta: money(0, 'VND') },
    ]);
  });
});
