// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { i18n, vuetifyLocale } from '@/i18n';
import App from '@/App.vue';

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

describe('App.vue Shift & Store Reports Header Integration', () => {
  it('renders Shift button and Store Reports button in header and mounts modals', async () => {
    const wrapper = mount(App, {
      global: {
        plugins: [i18n, vuetifyLocale],
        stubs: { TypeDesigner: true, CatalogAdmin: true, PosTerminal: true },
      },
    });
    mounted.push(wrapper);

    await flushPromises();

    const shiftBtn = wrapper.find('[data-test="shift-btn"]');
    expect(shiftBtn.exists()).toBe(true);

    const reportsBtn = wrapper.find('[data-test="store-reports-btn"]');
    expect(reportsBtn.exists()).toBe(true);

    // Verify modals are mounted in DOM
    expect(wrapper.findComponent({ name: 'ShiftModal' }).exists()).toBe(true);
    expect(wrapper.findComponent({ name: 'StoreReportsModal' }).exists()).toBe(true);

    // Clicking shift button opens shift modal
    await shiftBtn.trigger('click');
    expect(wrapper.find('[data-test="shift-modal"]').exists()).toBe(true);

    // Clicking reports button opens reports modal
    await reportsBtn.trigger('click');
    expect(wrapper.find('[data-test="store-reports-modal"]').exists()).toBe(true);
  });
});
