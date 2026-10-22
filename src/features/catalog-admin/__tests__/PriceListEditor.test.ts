// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PriceListEditor from '../PriceListEditor.vue';
import type { PriceListFormValue } from '../PriceListEditor.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { money } from '@/core/money';
import { createPriceListDoc } from '@/core/catalog/price-list';
import type { PriceListDoc } from '@/core/catalog/price-list';
import { createProductDoc } from '@/core/catalog/product';
import type { ProductDoc, ProductVariant } from '@/core/catalog/product';

const t = i18n.global.t.bind(i18n.global);
const NOW = '2026-10-22T00:00:00.000Z';

const SIZES: readonly ProductVariant[] = [
  { id: 'size-s', name: { vi: 'Tô nhỏ', en: 'Small' }, priceDelta: money(-10000, 'VND') },
  { id: 'size-l', name: { vi: 'Tô lớn', en: 'Large' }, priceDelta: money(9000, 'VND') },
];

function product(id: string, vi: string, variants: readonly ProductVariant[] = []): ProductDoc {
  return createProductDoc({
    id,
    name: { vi, en: vi },
    basePrice: money(65000, 'VND'),
    variants,
    now: NOW,
  });
}

const phoBo = product('pho-bo', 'Phở bò', SIZES);
const traDa = product('tra-da', 'Trà đá');
const products: readonly ProductDoc[] = [phoBo, traDa];

function priceList(id: string): PriceListDoc {
  return createPriceListDoc({
    id,
    name: { vi: 'Giờ vàng', en: 'Happy hour' },
    effectiveFrom: '2026-10-22T07:00:00.000Z',
    effectiveTo: '2026-10-22T10:00:00.000Z',
    priority: 1,
    entries: [{ productId: 'product:pho-bo', variantId: null, price: money(50000, 'VND') }],
    branchId: 'hq',
    now: NOW,
  });
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountEditor(
  over: Partial<{ priceList: PriceListDoc | null; products: readonly ProductDoc[] }> = {},
): VueWrapper {
  const wrapper = mount(PriceListEditor, {
    props: { priceList: null, products, branchId: 'hq', ...over },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function inputValue(wrapper: VueWrapper, selector: string): string | undefined {
  const element = wrapper.find(selector).element as HTMLInputElement | undefined;
  return element?.value;
}

/** Payload của lần `save` đầu tiên — `emitted` trả `unknown` nên ép kiểu ở ranh giới test. */
function savedValue(wrapper: VueWrapper): PriceListFormValue {
  return wrapper.emitted('save')?.[0]?.[0] as PriceListFormValue;
}

async function addEntry(wrapper: VueWrapper): Promise<void> {
  await wrapper.find('[data-entry-add]').trigger('click');
  await nextTick();
}

/**
 * Chọn một mục trong `Select` của Vuetify0 nằm trong một dòng mặt hàng: bấm activator
 * rồi bấm item. Phải khoanh vùng theo `[data-entry-*]` vì một dòng có hai select.
 */
async function pickFromSelect(
  wrapper: VueWrapper,
  scope: string,
  label: string,
  row = 0,
): Promise<void> {
  const target = wrapper.findAll('[data-entry-row]')[row];
  if (target === undefined) throw new Error(`entry row ${row} not found`);

  const activator = target.find(`${scope} [role="combobox"]`);
  if (activator.exists()) await activator.trigger('click');
  await nextTick();

  const item = target
    .findAll(`${scope} [role="option"]`)
    .find((node) => node.text().trim() === label);
  if (item === undefined) throw new Error(`option not found in ${scope}: ${label}`);
  await item.trigger('click');
  await nextTick();
}

async function setEntryPrice(wrapper: VueWrapper, amount: string, row = 0): Promise<void> {
  const target = wrapper.findAll('[data-entry-row]')[row];
  if (target === undefined) throw new Error(`entry row ${row} not found`);
  await target.find('[data-entry-price] input').setValue(amount);
}

describe('PriceListEditor', () => {
  it('loads an existing price list into the form', () => {
    const wrapper = mountEditor({ priceList: priceList('happy-hour') });

    expect(inputValue(wrapper, '[data-price-name] input')).toBe('Giờ vàng');
    expect(wrapper.findAll('[data-entry-row]')).toHaveLength(1);
  });

  it('shows a variant row per size for the chosen product', async () => {
    const wrapper = mountEditor();
    await addEntry(wrapper);
    await pickFromSelect(wrapper, '[data-entry-product]', 'Phở bò');

    // Món có hai kích cỡ → select kích cỡ có "mọi kích cỡ" + một mục cho mỗi size.
    const sizes = wrapper
      .findAll('[data-entry-variant] [role="option"]')
      .map((node) => node.text().trim());

    expect(sizes).toEqual([t('catalog.price.allVariants'), 'Tô nhỏ', 'Tô lớn']);
  });

  it('sends null variantId for "mọi kích cỡ"', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-price-name] input').setValue('Giờ vàng');
    await wrapper.find('[data-price-from] input').setValue('2026-10-22T14:00');

    await addEntry(wrapper);
    await pickFromSelect(wrapper, '[data-entry-product]', 'Phở bò');
    await setEntryPrice(wrapper, '50000');
    await wrapper.find('[data-price-form]').trigger('submit');

    expect(savedValue(wrapper).entries).toEqual([
      { productId: 'product:pho-bo', variantId: null, price: money(50000, 'VND') },
    ]);
  });

  it('keeps the chosen size as an absolute price entry', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-price-name] input').setValue('Giờ vàng');
    await wrapper.find('[data-price-from] input').setValue('2026-10-22T14:00');

    await addEntry(wrapper);
    await pickFromSelect(wrapper, '[data-entry-product]', 'Phở bò');
    await pickFromSelect(wrapper, '[data-entry-variant]', 'Tô lớn');
    await setEntryPrice(wrapper, '60000');
    await wrapper.find('[data-price-form]').trigger('submit');

    expect(savedValue(wrapper).entries).toEqual([
      { productId: 'product:pho-bo', variantId: 'size-l', price: money(60000, 'VND') },
    ]);
  });

  it('warns when the window ends before it starts', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-price-name] input').setValue('Giờ vàng');
    await wrapper.find('[data-price-from] input').setValue('2026-10-22T17:00');
    await wrapper.find('[data-price-to] input').setValue('2026-10-22T14:00');
    await wrapper.find('[data-price-form]').trigger('submit');
    await nextTick();

    // Cảnh báo lấy từ `validatePriceList` của core, không phải luật tự viết ở UI.
    expect(wrapper.find('[role="alert"]').text()).toMatch(/after/i);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('refuses an entry that has a product but no price', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-price-name] input').setValue('Giờ vàng');
    await wrapper.find('[data-price-from] input').setValue('2026-10-22T14:00');

    await addEntry(wrapper);
    await pickFromSelect(wrapper, '[data-entry-product]', 'Phở bò');
    await wrapper.find('[data-price-form]').trigger('submit');
    await nextTick();

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toContain(t('catalog.price.entryIncomplete'));
  });

  it('emits cancel without saving', async () => {
    const wrapper = mountEditor({ priceList: priceList('happy-hour') });
    await wrapper.find('[data-price-cancel]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('save')).toBeUndefined();
  });
});
