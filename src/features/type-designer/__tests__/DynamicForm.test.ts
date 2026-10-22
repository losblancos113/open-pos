// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import DynamicForm from '../DynamicForm.vue';
import { i18n } from '@/i18n';
import type { TypeDefinition } from '@/core/types/definition';
import { money } from '@/core/money';

const def: TypeDefinition = {
  key: 'product',
  kind: 'builtin_ext',
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  version: 1,
  listView: ['name'],
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

function mountForm(record: Record<string, unknown> = {}) {
  return mount(DynamicForm, {
    props: { definition: def, modelValue: record, locale: 'vi' as const },
    global: { plugins: [i18n] },
  });
}

describe('DynamicForm', () => {
  it('renders one control per field', () => {
    const wrapper = mountForm();
    expect(wrapper.findAll('[data-field]')).toHaveLength(3);
  });

  it('shows the computed formula value without an input', () => {
    const wrapper = mountForm({ name: 'Phở', price: money(100000, 'VND') });
    const cost = wrapper.find('[data-field="cost"]');
    expect(cost.text()).toContain('60');
    expect(cost.find('input').exists()).toBe(false);
  });

  it('marks the computed field as read-only', () => {
    expect(mountForm().find('[data-field="cost"]').attributes('data-computed')).toBe('true');
  });

  it('emits update:modelValue when a field changes', async () => {
    const wrapper = mountForm();
    await wrapper.find('[data-field="name"] input').setValue('Phở bò');
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ name: 'Phở bò' });
  });

  it('shows a validation error for a missing required field after submit', async () => {
    const wrapper = mountForm();
    expect(wrapper.text()).not.toContain(i18n.global.t('type.record.required'));
    await wrapper.find('form').trigger('submit');
    expect(wrapper.text()).toContain(i18n.global.t('type.record.required'));
  });

  it('does not emit submit while a required field is empty', async () => {
    const wrapper = mountForm();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('emits submit with the record when every required field is filled', async () => {
    const wrapper = mountForm({ name: 'Phở' });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Phở' });
  });

  it('does not persist computed values in the submitted record', async () => {
    const wrapper = mountForm({ name: 'Phở', price: money(100000, 'VND') });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]?.[0]).not.toHaveProperty('cost');
  });

  it('lets an optional field stay empty while a computed field depends on it', async () => {
    const wrapper = mountForm({ name: 'Phở' });
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeDefined();
  });

  it('offers a save control labelled from i18n', () => {
    const wrapper = mountForm({ name: 'Phở' });
    const submit = wrapper.find('form [data-form-submit]');
    expect(submit.exists()).toBe(true);
    expect(submit.text()).toBe(i18n.global.t('type.form.save'));
  });

  it('emits submit when the save control is clicked', async () => {
    const wrapper = mountForm({ name: 'Phở' });
    await wrapper.find('form [data-form-submit]').trigger('click');
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ name: 'Phở' });
  });

  it('does not emit submit when the save control is clicked while a required field is empty', async () => {
    const wrapper = mountForm();
    await wrapper.find('form [data-form-submit]').trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(wrapper.text()).toContain(i18n.global.t('type.record.required'));
  });
});
