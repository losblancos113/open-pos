// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import BranchOverrideEditor from '../BranchOverrideEditor.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { format, money } from '@/core/money';
import type { Money } from '@/core/money';
import { createOverrideDoc } from '@/core/catalog/override';
import type { ProductOverrideDoc } from '@/core/catalog/override';
import { createProductDoc } from '@/core/catalog/product';
import type { ProductDoc } from '@/core/catalog/product';
import type { MenuItem } from '@/core/catalog/menu';

const t = i18n.global.t.bind(i18n.global);
const NOW = '2026-10-22T00:00:00.000Z';

function product(id: string, vi: string): ProductDoc {
  return createProductDoc({
    id,
    name: { vi, en: vi },
    basePrice: money(65000, 'VND'),
    now: NOW,
  });
}

const phoBo = product('pho-bo', 'Phở bò');
const traDa = product('tra-da', 'Trà đá');

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

function overrideDoc(
  productId: string,
  over: Partial<{ price: Money | null; available: boolean; sortOrder: number | null }> = {},
): ProductOverrideDoc {
  return createOverrideDoc({
    productId,
    branchId: 'hq',
    price: over.price ?? null,
    available: over.available ?? true,
    sortOrder: over.sortOrder ?? null,
    now: NOW,
  });
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountEditor(
  over: Partial<{
    overrides: readonly ProductOverrideDoc[];
    items: readonly MenuItem[];
  }> = {},
): VueWrapper {
  const wrapper = mount(BranchOverrideEditor, {
    props: { overrides: [], items: [item(phoBo)], branchId: 'hq', ...over },
    global: { plugins: [i18n, vuetifyLocale] },
  });
  mounted.push(wrapper);
  return wrapper;
}

/** Payload của lần `set` đầu tiên — `emitted` trả `unknown` nên ép kiểu ở ranh giới test. */
function setValue(wrapper: VueWrapper): {
  productId: string;
  price: Money | null;
  available: boolean;
  sortOrder: number | null;
} {
  return wrapper.emitted('set')?.[0]?.[0] as {
    productId: string;
    price: Money | null;
    available: boolean;
    sortOrder: number | null;
  };
}

describe('BranchOverrideEditor', () => {
  it('lists every item of the branch with its base price', () => {
    const wrapper = mountEditor({ items: [item(phoBo), item(traDa)] });

    expect(wrapper.findAll('[data-override-row]')).toHaveLength(2);
    expect(wrapper.find('[data-override-row="product:pho-bo"]').text()).toContain(
      format(money(65000, 'VND')),
    );
  });

  it('marks a product unavailable without touching its price', async () => {
    const wrapper = mountEditor({ items: [item(phoBo)] });

    // `Switch.Root` của Vuetify0 render `<button role="switch">` — bấm để tắt.
    await wrapper.find('[data-override-available="product:pho-bo"]').trigger('click');

    expect(setValue(wrapper)).toMatchObject({
      productId: 'product:pho-bo',
      available: false,
      price: null,
    });
  });

  it('shows the effective price coming from the override', () => {
    const wrapper = mountEditor({
      items: [item(phoBo, { price: money(60000, 'VND'), priceSource: 'override' })],
      overrides: [overrideDoc('product:pho-bo', { price: money(60000, 'VND') })],
    });

    const effective = wrapper.find('[data-override-effective="product:pho-bo"]');
    expect(effective.text()).toContain(format(money(60000, 'VND')));
    expect(effective.text()).toContain(t('catalog.priceSource.override'));
  });

  it('shows the global price when the branch has no override', () => {
    const wrapper = mountEditor({ items: [item(phoBo)] });

    const effective = wrapper.find('[data-override-effective="product:pho-bo"]');
    expect(effective.text()).toContain(t('catalog.priceSource.base'));
  });

  it('sends the branch price typed into the row', async () => {
    const wrapper = mountEditor({ items: [item(phoBo)] });

    const input = wrapper.find('[data-override-price="product:pho-bo"] input');
    await input.setValue('60000');
    await input.trigger('blur');

    expect(setValue(wrapper)).toMatchObject({
      productId: 'product:pho-bo',
      price: money(60000, 'VND'),
      available: true,
    });
  });

  it('sends the branch sort order typed into the row', async () => {
    const wrapper = mountEditor({ items: [item(phoBo)] });

    const input = wrapper.find('[data-override-sort-order="product:pho-bo"] input');
    await input.setValue('2');
    await input.trigger('blur');

    expect(setValue(wrapper)).toMatchObject({ productId: 'product:pho-bo', sortOrder: 2 });
  });

  it('clears an override back to the global price', async () => {
    const wrapper = mountEditor({
      items: [item(phoBo)],
      overrides: [overrideDoc('product:pho-bo', { price: money(60000, 'VND') })],
    });

    await wrapper.find('[data-override-clear="product:pho-bo"]').trigger('click');
    await nextTick();

    expect(wrapper.emitted('clear')?.[0]).toEqual(['product:pho-bo']);
    expect(wrapper.emitted('set')).toBeUndefined();
  });

  it('offers no clear button when the branch has no override', () => {
    const wrapper = mountEditor({ items: [item(phoBo)] });

    expect(wrapper.find('[data-override-clear="product:pho-bo"]').exists()).toBe(false);
  });
});
