// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import TypeDesigner from '../TypeDesigner.vue';
import { i18n } from '@/i18n';

const t = i18n.global.t.bind(i18n.global);

/** Nút theo nhãn hiển thị — sidebar cũng có nút nên phải khớp theo text. */
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find((node) => node.text().includes(label));
  if (found === undefined) throw new Error(`button not found: ${label}`);
  return found;
}

/** `onMounted` dựng adapter + registry bất đồng bộ nên phải xả microtask. */
async function mountDesigner(): Promise<VueWrapper> {
  const wrapper = mount(TypeDesigner, { global: { plugins: [i18n] } });
  await flushPromises();
  await flushPromises();
  await nextTick();
  return wrapper;
}

async function typeInto(wrapper: VueWrapper, index: number, value: string): Promise<void> {
  const input = wrapper.findAll('input')[index];
  if (input === undefined) throw new Error(`no input at index ${index}`);
  await input.setValue(value);
  await nextTick();
}

/** Nút nằm trong một field row — sidebar cũng có nút nên phải khoanh vùng theo text. */
async function clickInRow(wrapper: VueWrapper, rowKey: string, label: string): Promise<void> {
  const row = wrapper.find(`[data-field-row="${rowKey}"]`);
  const found = row.findAll('button').find((node) => node.text().includes(label));
  if (found === undefined) throw new Error(`button not found in row ${rowKey}: ${label}`);
  await found.trigger('click');
  await nextTick();
}

/**
 * Đổi `dataType` của một field. Vuetify0 `Select` là nút activator + popover listbox,
 * không phải `<select>` thô — nên phải bấm activator rồi bấm item.
 */
async function setRowDataType(wrapper: VueWrapper, rowKey: string, dataType: string): Promise<void> {
  const row = wrapper.find(`[data-field-row="${rowKey}"]`);
  await row.find('[role="combobox"]').trigger('click');
  await nextTick();
  const item = row
    .findAll('[role="option"]')
    .find((node) => node.text().includes(t(`type.dataType.${dataType}`)));
  if (item === undefined) throw new Error(`data type option not found: ${dataType}`);
  await item.trigger('click');
  await nextTick();
}

describe('TypeDesigner', () => {
  it('mounts on an empty registry and offers to create a type', async () => {
    const wrapper = await mountDesigner();

    expect(wrapper.text()).toContain(t('type.designer.title'));
    expect(wrapper.text()).toContain(t('type.designer.empty'));
    expect(button(wrapper, t('type.designer.newType'))).toBeDefined();
  });

  it('creates a type from the form and lists it', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    // 0 = type key, 1 = vi name, 2 = en name (no hidden inputs before them).
    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).toContain('Món ăn');
    expect(wrapper.find('[data-type-key="menu_item"]').exists()).toBe(true);
    // Type mới lưu xong thì không còn là "chưa có type nào".
    expect(wrapper.text()).not.toContain(t('type.designer.empty'));
  });

  it('records a migration step when a saved field key changes', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    // Thêm field rồi khai key — bản nháp chưa có key gốc nên chưa sinh transform.
    await button(wrapper, t('type.field.add')).trigger('click');
    await nextTick();
    const row = wrapper.find('[data-field-row=""]');
    await row.find('input').setValue('rating');
    await nextTick();

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    // Chưa đổi key gốc → chưa có bậc migration nào.
    expect(button(wrapper, t('type.migration.run')).attributes('disabled')).toBeDefined();

    // Đổi key gốc của field đã lưu → phải sinh bậc migration (rename).
    const saved = wrapper.find('[data-field-row="rating"]');
    await saved.find('input').setValue('quality');
    await nextTick();

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-field-row="quality"]').exists()).toBe(true);
    expect(button(wrapper, t('type.migration.run')).attributes('disabled')).toBeUndefined();
  });

  it('does not offer a migration when a field is only removed from the schema', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    await button(wrapper, t('type.field.add')).trigger('click');
    await nextTick();
    const row = wrapper.find('[data-field-row=""]');
    await row.find('input').setValue('rating');
    await nextTick();

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(wrapper.find('[data-field-row="rating"]').exists()).toBe(true);

    // Xoá field khỏi *schema* rồi lưu. Field biến mất khỏi định nghĩa nhưng không
    // sinh transform nào, nên không có gì để migrate — nút vẫn tắt, và giá trị cũ
    // trong record không bị xoá (xem migration.test.ts).
    await button(wrapper, t('type.field.remove')).trigger('click');
    await nextTick();
    expect(wrapper.find('[data-field-row="rating"]').exists()).toBe(false);

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    expect(button(wrapper, t('type.migration.run')).attributes('disabled')).toBeDefined();
  });

  it('shows the engine validation error under the offending field', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    await button(wrapper, t('type.field.add')).trigger('click');
    await nextTick();
    await wrapper.find('[data-field-row=""]').find('input').setValue('_id');
    await nextTick();

    // `_id` là khoá hệ thống giữ riêng — engine trả `reserved_key` tại path của field,
    // và lỗi phải hiện ngay dưới field đó chứ không phải ở đâu khác.
    const row = wrapper.find('[data-field-row="_id"]');
    expect(row.text()).toContain(t('type.error.reservedKey'));

    // Còn lỗi thì không lưu được.
    expect(button(wrapper, t('type.form.save')).attributes('disabled')).toBeDefined();
  });

  it('adds options to a select field and persists them', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    await button(wrapper, t('type.field.add')).trigger('click');
    await nextTick();
    await wrapper.find('[data-field-row=""]').find('input').setValue('spicy');
    await nextTick();

    await setRowDataType(wrapper, 'spicy', 'select');

    // Chọn một mà chưa khai option nào → engine báo lỗi và chặn lưu.
    expect(wrapper.find('[data-field-row="spicy"]').text()).toContain(t('type.error.missingOptions'));
    expect(button(wrapper, t('type.form.save')).attributes('disabled')).toBeDefined();

    await clickInRow(wrapper, 'spicy', t('type.field.addOption'));
    const option = wrapper.find('[data-field-row="spicy"]').find('.type-designer__option');
    expect(option.exists()).toBe(true);
    const optionInputs = option.findAll('input');
    await optionInputs[0]?.setValue('hot');
    await nextTick();
    await optionInputs[1]?.setValue('Cay');
    await nextTick();

    expect(wrapper.find('[data-field-row="spicy"]').text()).not.toContain(t('type.error.missingOptions'));
    expect(button(wrapper, t('type.form.save')).attributes('disabled')).toBeUndefined();

    await button(wrapper, t('type.form.save')).trigger('click');
    await flushPromises();
    await flushPromises();
    await nextTick();

    // Đọc lại từ registry: option vừa khai phải còn nguyên cả value lẫn nhãn.
    const saved = wrapper.find('[data-field-row="spicy"]');
    expect(saved.exists()).toBe(true);
    const savedOption = saved.find('.type-designer__option');
    expect(savedOption.findAll('input')[0]?.element.value).toBe('hot');
    expect(savedOption.findAll('input')[1]?.element.value).toBe('Cay');
  });

  it('removes an option from a select field', async () => {
    const wrapper = await mountDesigner();
    await button(wrapper, t('type.designer.newType')).trigger('click');
    await nextTick();

    await typeInto(wrapper, 0, 'menu_item');
    await typeInto(wrapper, 1, 'Món ăn');

    await button(wrapper, t('type.field.add')).trigger('click');
    await nextTick();
    await wrapper.find('[data-field-row=""]').find('input').setValue('spicy');
    await nextTick();
    await setRowDataType(wrapper, 'spicy', 'select');

    await clickInRow(wrapper, 'spicy', t('type.field.addOption'));
    await clickInRow(wrapper, 'spicy', t('type.field.addOption'));
    const row = wrapper.find('[data-field-row="spicy"]');
    expect(row.findAll('.type-designer__option').length).toBe(2);

    await row.findAll('.type-designer__option')[1]?.findAll('button')[0]?.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-field-row="spicy"]').findAll('.type-designer__option').length).toBe(1);
  });
});
