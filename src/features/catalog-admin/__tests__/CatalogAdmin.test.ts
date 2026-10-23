// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import CatalogAdmin from '../CatalogAdmin.vue';
import { i18n, vuetifyLocale } from '@/i18n';
import { createMemoryAdapter } from '@/core/db/memory-adapter';

/**
 * `CatalogAdmin` là vỏ điều phối: nó sở hữu dữ liệu và chuyển tab. Test này chỉ khoá
 * phần **điều hướng tab** — stub các màn con để không phải dựng cả bảng dữ liệu.
 *
 * `aria-pressed` là thứ trình đọc màn hình dùng để nói tab nào đang mở. ButtonRoot chỉ
 * gắn nó khi đăng ký với `Button.Group` (xem `App.vue`), nên các tab con phải nằm trong
 * một group — nếu không, attribute bind ở đây bị ghi đè thành `undefined` và rơi khỏi DOM.
 */
const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

async function mountAdmin(): Promise<VueWrapper> {
  const adapter = await createMemoryAdapter();
  const wrapper = mount(CatalogAdmin, {
    props: { adapter },
    global: {
      plugins: [i18n, vuetifyLocale],
      stubs: {
        CategoryList: true,
        ProductList: true,
        ModifierGroupEditor: true,
        ComboEditor: true,
        PriceListEditor: true,
        BranchOverrideEditor: true,
        CsvPanel: true,
      },
    },
  });
  mounted.push(wrapper);
  await flushPromises();
  return wrapper;
}

describe('CatalogAdmin tab navigation', () => {
  it('marks exactly the active tab with aria-pressed', async () => {
    const wrapper = await mountAdmin();
    const tabs = wrapper.findAll('[data-catalog-tab]');
    expect(tabs.length).toBeGreaterThan(0);

    const pressed = tabs.filter((tab) => tab.attributes('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.attributes('data-catalog-tab')).toBe('categories');
  });

  it('moves aria-pressed when the user switches tabs', async () => {
    const wrapper = await mountAdmin();
    await wrapper.find('[data-catalog-tab="products"]').trigger('click');
    await flushPromises();

    const pressed = wrapper
      .findAll('[data-catalog-tab]')
      .filter((tab) => tab.attributes('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.attributes('data-catalog-tab')).toBe('products');
  });

  it('keeps one tab open when the active tab is clicked again', async () => {
    const wrapper = await mountAdmin();
    await wrapper.find('[data-catalog-tab="categories"]').trigger('click');
    await flushPromises();

    // `mandatory`: bấm lại tab đang mở không được bỏ chọn và để màn hình trắng.
    const pressed = wrapper
      .findAll('[data-catalog-tab]')
      .filter((tab) => tab.attributes('aria-pressed') === 'true');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]?.attributes('data-catalog-tab')).toBe('categories');
  });
});
