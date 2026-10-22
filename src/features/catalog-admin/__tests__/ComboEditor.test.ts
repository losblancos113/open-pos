// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import ComboEditor from '../ComboEditor.vue';
import type { ComboFormValue } from '../ComboEditor.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { money } from '@/core/money';
import { createComboDoc } from '@/core/catalog/combo';
import type { ComboDoc } from '@/core/catalog/combo';
import { createProductDoc } from '@/core/catalog/product';
import type { ProductDoc } from '@/core/catalog/product';

const NOW = '2026-10-22T00:00:00.000Z';

function product(id: string, vi: string, en: string): ProductDoc {
  return createProductDoc({
    id,
    name: { vi, en },
    basePrice: money(65000, 'VND'),
    now: NOW,
  });
}

const phoBo = product('pho-bo', 'Phở bò', 'Beef pho');
const traDa = product('tra-da', 'Trà đá', 'Iced tea');

const products: readonly ProductDoc[] = [phoBo, traDa];

function combo(id: string): ComboDoc {
  return createComboDoc({
    id,
    name: { vi: 'Cơm trưa', en: 'Lunch set' },
    basePrice: money(55000, 'VND'),
    comboGroups: [
      {
        key: 'main',
        label: { vi: 'Món chính', en: 'Main' },
        minSelect: 1,
        maxSelect: 1,
        options: [{ optionId: 'opt:pho-bo', productId: 'product:pho-bo', priceDelta: money(0, 'VND') }],
      },
    ],
    now: NOW,
  });
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountEditor(over: Partial<{ combo: ComboDoc | null; products: readonly ProductDoc[] }> = {}): VueWrapper {
  const wrapper = mount(ComboEditor, {
    props: { combo: null, products, ...over },
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
function savedValue(wrapper: VueWrapper): ComboFormValue {
  return wrapper.emitted('save')?.[0]?.[0] as ComboFormValue;
}

/**
 * Chọn món con cho một dòng option. `Select` của Vuetify0 là nút activator + popover
 * listbox: bấm activator rồi bấm item, giống `TypeDesigner.test.ts`.
 */
async function pickProduct(wrapper: VueWrapper, row: number, name: string): Promise<void> {
  const option = wrapper.findAll('[data-combo-option]')[row];
  if (option === undefined) throw new Error(`combo option row ${row} not found`);

  await option.find('[role="combobox"]').trigger('click');
  await nextTick();

  const item = option.findAll('[role="option"]').find((node) => node.text().trim() === name);
  if (item === undefined) throw new Error(`product option not found: ${name}`);
  await item.trigger('click');
  await nextTick();
}

describe('ComboEditor', () => {
  it('loads an existing combo into the form', () => {
    const wrapper = mountEditor({ combo: combo('com-trua') });

    expect(inputValue(wrapper, '[data-combo-name] input')).toBe('Cơm trưa');
    expect(wrapper.findAll('[data-combo-group]')).toHaveLength(1);
    expect(wrapper.findAll('[data-combo-option]')).toHaveLength(1);
  });

  it('adds a group and an option inside it', async () => {
    const wrapper = mountEditor();
    expect(wrapper.findAll('[data-combo-group]')).toHaveLength(0);

    await wrapper.find('[data-combo-group-add]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('[data-combo-group]')).toHaveLength(1);

    await wrapper.find('[data-combo-option-add]').trigger('click');
    await nextTick();
    expect(wrapper.findAll('[data-combo-option]')).toHaveLength(1);
  });

  it('only offers products as combo options', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-combo-group-add]').trigger('click');
    await nextTick();
    await wrapper.find('[data-combo-option-add]').trigger('click');
    await nextTick();

    await wrapper.find('[data-combo-option] [role="combobox"]').trigger('click');
    await nextTick();

    // Combo không lồng combo: mọi lựa chọn phải là một món trong `products`.
    const choices = wrapper.findAll('[data-combo-option] [role="option"]');
    expect(choices.length).toBeLessThanOrEqual(products.length);
    for (const choice of choices) {
      expect(products.some((entry) => entry.name.vi === choice.text().trim())).toBe(true);
    }
  });

  it('emits save with minSelect/maxSelect per group', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-combo-name] input').setValue('Cơm trưa');
    await wrapper.find('[data-combo-price] input').setValue('55000');

    await wrapper.find('[data-combo-group-add]').trigger('click');
    await nextTick();
    await wrapper.find('[data-combo-group-key] input').setValue('main');
    await wrapper.find('[data-combo-group-label] input').setValue('Món chính');
    await wrapper.find('[data-combo-group-min] input').setValue('1');
    await wrapper.find('[data-combo-group-max] input').setValue('1');

    await wrapper.find('[data-combo-option-add]').trigger('click');
    await nextTick();
    await pickProduct(wrapper, 0, 'Phở bò');

    await wrapper.find('[data-combo-form]').trigger('submit');

    const saved = savedValue(wrapper);
    expect(saved.basePrice).toEqual(money(55000, 'VND'));
    expect(saved.comboGroups).toEqual([
      {
        key: 'main',
        label: { vi: 'Món chính', en: 'Món chính' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt:pho-bo', productId: 'product:pho-bo', priceDelta: money(0, 'VND') },
        ],
      },
    ]);
  });

  it('shows the validator message when a group declares no options', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-combo-name] input').setValue('Cơm trưa');
    await wrapper.find('[data-combo-price] input').setValue('55000');

    await wrapper.find('[data-combo-group-add]').trigger('click');
    await nextTick();
    await wrapper.find('[data-combo-group-key] input').setValue('main');
    await wrapper.find('[data-combo-group-label] input').setValue('Món chính');

    await wrapper.find('[data-combo-form]').trigger('submit');
    await nextTick();

    expect(wrapper.find('[role="alert"]').text()).toMatch(/option/i);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('emits cancel without saving', async () => {
    const wrapper = mountEditor({ combo: combo('com-trua') });
    await wrapper.find('[data-combo-cancel]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('save')).toBeUndefined();
  });
});
