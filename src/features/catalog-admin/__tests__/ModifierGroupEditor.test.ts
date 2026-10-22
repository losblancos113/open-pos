// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import ModifierGroupEditor from '../ModifierGroupEditor.vue';
import type { ModifierGroupFormValue } from '../ModifierGroupEditor.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { money } from '@/core/money';
import { createModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';

const NOW = '2026-10-22T00:00:00.000Z';

function group(id: string, over: Partial<Pick<ModifierGroupDoc, 'minSelect' | 'maxSelect'>> = {}): ModifierGroupDoc {
  return createModifierGroupDoc({
    id,
    name: { vi: 'Topping', en: 'Toppings' },
    minSelect: over.minSelect ?? 0,
    maxSelect: over.maxSelect ?? 1,
    options: [{ id: 'trung', name: { vi: 'Trứng', en: 'Egg' }, priceDelta: money(5000, 'VND') }],
    now: NOW,
  });
}

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

function mountEditor(over: Partial<{ group: ModifierGroupDoc | null }> = {}): VueWrapper {
  const wrapper = mount(ModifierGroupEditor, {
    props: { group: null, ...over },
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
function savedValue(wrapper: VueWrapper): ModifierGroupFormValue {
  return wrapper.emitted('save')?.[0]?.[0] as ModifierGroupFormValue;
}

describe('ModifierGroupEditor', () => {
  it('loads an existing group into the form', () => {
    const wrapper = mountEditor({ group: group('topping') });

    expect(inputValue(wrapper, '[data-group-name] input')).toBe('Topping');
    expect(wrapper.findAll('[data-option-row]')).toHaveLength(1);
    expect(inputValue(wrapper, '[data-option-id] input')).toBe('trung');
  });

  it('emits save with the option list and its deltas', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-group-name] input').setValue('Topping');
    await wrapper.find('[data-option-add]').trigger('click');
    await wrapper.find('[data-option-id] input').setValue('trung');
    await wrapper.find('[data-option-name] input').setValue('Trứng');
    await wrapper.find('[data-option-delta] input').setValue('5000');
    await wrapper.find('[data-group-form]').trigger('submit');

    expect(savedValue(wrapper).options).toEqual([
      {
        id: 'trung',
        name: { vi: 'Trứng', en: 'Trứng' },
        priceDelta: money(5000, 'VND'),
        isDefault: false,
      },
    ]);
  });

  it('marks an option as default', async () => {
    const wrapper = mountEditor({ group: group('topping') });
    await wrapper.find('[data-option-default]').trigger('click');
    await wrapper.find('[data-group-form]').trigger('submit');

    expect(savedValue(wrapper).options[0]?.isDefault).toBe(true);
  });

  it('removes an option row', async () => {
    const wrapper = mountEditor({ group: group('topping') });
    expect(wrapper.findAll('[data-option-row]')).toHaveLength(1);

    await wrapper.find('[data-option-remove]').trigger('click');

    expect(wrapper.findAll('[data-option-row]')).toHaveLength(0);
  });

  it('shows the validator message when maxSelect is wider than the option list', async () => {
    const wrapper = mountEditor({ group: group('topping') });
    await wrapper.find('[data-group-max] input').setValue('3');
    await wrapper.find('[data-group-form]').trigger('submit');
    await nextTick();

    // Thông báo lấy từ `validateModifierGroup` của core — UI không tự viết luật.
    expect(wrapper.find('[role="alert"]').text()).toMatch(/maxSelect/i);
    expect(wrapper.emitted('save')).toBeUndefined();
  });

  it('refuses to save a group without options', async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-group-name] input').setValue('Topping');
    await wrapper.find('[data-group-form]').trigger('submit');

    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.find('[role="alert"]').text()).toMatch(/option/i);
  });

  it('emits cancel without saving', async () => {
    const wrapper = mountEditor({ group: group('topping') });
    await wrapper.find('[data-group-cancel]').trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('save')).toBeUndefined();
  });
});
