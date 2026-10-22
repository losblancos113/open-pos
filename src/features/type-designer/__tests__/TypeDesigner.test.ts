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
});
