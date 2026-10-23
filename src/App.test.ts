// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import App from './App.vue';
import { i18n, vuetifyLocale } from '@/i18n';

/**
 * `App.vue` là vỏ tích hợp: nó mở PouchDB trong `onMounted` và gắn hai màn hình thật.
 * Test này chỉ khoá phần **điều hướng** — thay kho bằng memory adapter và stub hai màn
 * hình con, nên không cần IndexedDB và không phụ thuộc component của M1/M2.
 */
vi.mock('pouchdb/dist/pouchdb.js', () => ({
  default: class FakePouchDB {
    constructor() {}
  },
}));

vi.mock('@/core/db/pouch-adapter', async () => {
  const { createMemoryAdapter } = await import('@/core/db/memory-adapter');
  return { createPouchAdapter: async () => createMemoryAdapter() };
});

const mounted: VueWrapper[] = [];

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
  vi.clearAllMocks();
});

function mountApp(): VueWrapper {
  const wrapper = mount(App, {
    global: {
      plugins: [i18n, vuetifyLocale],
      stubs: { TypeDesigner: true, CatalogAdmin: true, PosTerminal: true },
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

describe('App navigation', () => {
  it('marks exactly the active view with aria-pressed', async () => {
    const wrapper = mountApp();
    await flushPromises();

    const designer = wrapper.find('[data-view="designer"]');
    const catalog = wrapper.find('[data-view="catalog"]');
    const pos = wrapper.find('[data-view="pos"]');

    expect(designer.exists()).toBe(true);
    expect(catalog.exists()).toBe(true);
    expect(pos.exists()).toBe(true);

    // `aria-pressed` là thứ trình đọc màn hình dùng để nói "tab nào đang mở". Mất nó là
    // người dùng screen reader không biết mình đang ở màn nào (phát hiện ở Task 19 by-eye).
    expect(designer.attributes('aria-pressed')).toBe('true');
    expect(catalog.attributes('aria-pressed')).toBe('false');
    expect(pos.attributes('aria-pressed')).toBe('false');
  });

  it('moves aria-pressed when the user switches views', async () => {
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[data-view="catalog"]').trigger('click');

    expect(wrapper.find('[data-view="designer"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-view="catalog"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-view="pos"]').attributes('aria-pressed')).toBe('false');

    await wrapper.find('[data-view="pos"]').trigger('click');

    expect(wrapper.find('[data-view="designer"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-view="catalog"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-view="pos"]').attributes('aria-pressed')).toBe('true');

    await wrapper.find('[data-view="designer"]').trigger('click');

    expect(wrapper.find('[data-view="designer"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-view="catalog"]').attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('[data-view="pos"]').attributes('aria-pressed')).toBe('false');
  });

  it('keeps the inactive view mounted so its draft input is not lost', async () => {
    const wrapper = mountApp();
    await flushPromises();

    await wrapper.find('[data-view="catalog"]').trigger('click');

    // `v-show` (không phải `v-if`): đổi màn hình không được xoá dữ liệu đang nhập.
    // Cả ba khung vẫn nằm trong DOM; đúng hai khung bị ẩn.
    const views = wrapper.findAll('main.app > div');
    expect(views).toHaveLength(3);
    const hidden = views.filter((view) => view.attributes('style')?.includes('display: none'));
    expect(hidden).toHaveLength(2);
  });
});
