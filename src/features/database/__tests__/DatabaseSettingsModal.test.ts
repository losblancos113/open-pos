// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import DatabaseSettingsModal from '../DatabaseSettingsModal.vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import viMessages from '@/i18n/vi.json';

vi.mock('@/core/db/cosmos-provision', () => {
  return {
    testCosmosConnection: vi.fn().mockResolvedValue({ success: true, latencyMs: 42 }),
    ensureCosmosContainer: vi.fn().mockResolvedValue({ databaseCreated: true, containerCreated: true }),
  };
});

describe('DatabaseSettingsModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders modal with database configuration title and providers', async () => {
    const memoryAdapter = await createMemoryAdapter();
    wrapper = mount(DatabaseSettingsModal, {
      props: {
        open: true,
        currentAdapter: memoryAdapter,
      },
      global: {
        plugins: [i18n],
      },
    });

    expect(wrapper.text()).toContain(viMessages.database.title);
    expect(wrapper.text()).toContain(viMessages.database.provider);
  });

  it('emits close event when close button is clicked', async () => {
    const memoryAdapter = await createMemoryAdapter();
    wrapper = mount(DatabaseSettingsModal, {
      props: {
        open: true,
        currentAdapter: memoryAdapter,
      },
      global: {
        plugins: [i18n],
      },
    });

    const closeBtn = wrapper.find('[data-test="database-modal-close"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
