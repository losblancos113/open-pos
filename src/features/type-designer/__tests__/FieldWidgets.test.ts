// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FieldWidgets from '../FieldWidgets.vue';
import { i18n } from '@/i18n';
import { money } from '@/core/money';
import type { FieldDefinition } from '@/core/types/definition';

function field(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'dataType'>): FieldDefinition {
  return { key: 'f', label: { vi: 'F', en: 'F' }, required: false, ...over };
}

const OPTIONS = [
  { value: 'none', label: { vi: 'Không', en: 'None' } },
  { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
];

function mountWidget(f: FieldDefinition, modelValue: unknown = null, extra: Record<string, unknown> = {}) {
  return mount(FieldWidgets, {
    props: { field: f, modelValue, ...extra },
    global: { plugins: [i18n] },
  });
}

/**
 * Selectors khớp với DOM thật của Vuetify0 (không phải HTML thô như plan cũ):
 * `Input.Control` → `<input>`; `NumberField.Control` → `<input role="spinbutton">`;
 * `Checkbox.Root` → `<button role="checkbox">`; `Select.Root` → `<button role="combobox">`.
 */
const WIDGET_SELECTORS: [FieldDefinition['dataType'], string][] = [
  ['text', 'input[type="text"]'],
  ['textarea', 'textarea'],
  ['number', '[role="spinbutton"]'],
  ['decimal', '[role="spinbutton"]'],
  ['money', '[role="spinbutton"]'],
  ['boolean', '[role="checkbox"]'],
  ['date', 'input[type="date"]'],
  ['datetime', 'input[type="datetime-local"]'],
  ['select', '[role="combobox"]'],
  ['multiselect', '[role="checkbox"]'],
  ['color', 'input[type="color"]'],
  ['reference', 'input[type="text"]'],
  ['image', 'input[type="text"]'],
];

describe('FieldWidgets', () => {
  it.each(WIDGET_SELECTORS)('renders the right control for %s', (dataType, selector) => {
    const wrapper = mountWidget(field({ dataType, options: OPTIONS }));
    expect(wrapper.find(selector).exists()).toBe(true);
  });

  it('renders a computed formula field as read-only text', () => {
    // D4: giá trị công thức chỉ có thể là number / money / boolean — không phải chuỗi.
    const wrapper = mountWidget(field({ dataType: 'formula', formula: 'price * 0.6' }), 60000);
    expect(wrapper.find('input, textarea').exists()).toBe(false);
    expect(wrapper.text()).toContain('60000');
  });

  it('shows a computed formula field in Money units', () => {
    const wrapper = mountWidget(field({ dataType: 'formula', formula: 'price * 0.6' }), money(60000, 'VND'));
    expect(wrapper.text()).toContain('60');
    expect(wrapper.find('input, textarea').exists()).toBe(false);
  });

  it('labels the control with the field label for the active locale', () => {
    const wrapper = mountWidget(
      field({ dataType: 'text', label: { vi: 'Tên món', en: 'Dish name' } }),
      '',
      { locale: 'vi' },
    );
    expect(wrapper.find('input').attributes('aria-label')).toBe('Tên món');
  });

  it('emits update:modelValue when the user types', async () => {
    const wrapper = mountWidget(field({ dataType: 'text' }), '');
    await wrapper.find('input').setValue('Phở bò');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Phở bò']);
  });

  it('emits a number, not a string, for a number field', async () => {
    const wrapper = mountWidget(field({ dataType: 'number' }), null);
    await wrapper.find('[role="spinbutton"]').setValue('42');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([42]);
  });

  it('emits a scaled integer for a decimal field', async () => {
    const wrapper = mountWidget(field({ dataType: 'decimal', scale: 2 }), null);
    await wrapper.find('[role="spinbutton"]').setValue('12.34');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([1234]);
  });

  it('emits Money for a money field', async () => {
    const wrapper = mountWidget(field({ dataType: 'money' }), null);
    await wrapper.find('[role="spinbutton"]').setValue('69000');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([money(69000, 'VND')]);
  });

  it('emits a boolean for a checkbox', async () => {
    const wrapper = mountWidget(field({ dataType: 'boolean' }), false);
    await wrapper.find('[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true]);
  });

  it('emits an ISO datetime for a datetime field', async () => {
    const wrapper = mountWidget(field({ dataType: 'datetime' }), null);
    await wrapper.find('input[type="datetime-local"]').setValue('2026-10-20T14:30');
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0];
    expect(typeof emitted).toBe('string');
    expect(new Date(emitted as string).toISOString()).toBe(emitted);
  });

  it('renders one option per declared select option', () => {
    const wrapper = mountWidget(field({ dataType: 'select', options: OPTIONS }));
    expect(wrapper.findAll('[role="option"]')).toHaveLength(2);
  });

  it('renders one checkbox per declared multiselect option', () => {
    const wrapper = mountWidget(field({ dataType: 'multiselect', options: OPTIONS }), []);
    expect(wrapper.findAll('[role="checkbox"]')).toHaveLength(2);
  });

  it('emits an array of option values for a multiselect', async () => {
    const wrapper = mountWidget(field({ dataType: 'multiselect', options: OPTIONS }), []);
    await wrapper.findAll('[role="checkbox"]')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['hot']]);
  });

  it('shows the localized label for the field data type', () => {
    const wrapper = mountWidget(field({ dataType: 'money' }), null, { locale: 'vi' });
    expect(wrapper.text()).toContain(i18n.global.t('type.dataType.money'));
  });

  it('marks a required control so the browser can enforce it', () => {
    const wrapper = mountWidget(field({ dataType: 'text', required: true }), '');
    expect(wrapper.find('input').attributes('required')).toBeDefined();
  });
});
