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

vi.mock('@/core/db/firestore-provision', () => {
  return {
    testFirestoreConnection: vi.fn().mockResolvedValue({ success: true, latencyMs: 55 }),
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

  it('renders Firestore fields when firestore is selected and populates on paste', async () => {
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

    // Select firestore
    const firestoreItem = wrapper.find('[data-value="firestore"]');
    expect(firestoreItem.exists()).toBe(true);
    await firestoreItem.trigger('click');

    // Check firestore fields appear
    expect(wrapper.find('[data-test="firestore-api-key"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="firestore-project-id"]').exists()).toBe(true);

    // Paste snippet
    const pasteBtn = wrapper.find('[data-test="firestore-paste-btn"]');
    expect(pasteBtn.exists()).toBe(true);
    await pasteBtn.trigger('click');

    const pasteTextarea = wrapper.find('[data-test="firestore-paste-textarea"]');
    expect(pasteTextarea.exists()).toBe(true);
    await pasteTextarea.setValue(
      JSON.stringify({
        apiKey: 'AIzaPastedKey123',
        projectId: 'pasted-proj',
        authDomain: 'pasted.firebaseapp.com',
        appId: '1:pasted:web',
      }),
    );

    const applyPasteBtn = wrapper.find('[data-test="firestore-apply-paste-btn"]');
    await applyPasteBtn.trigger('click');

    // Verify fields populated
    const apiKeyInput = wrapper.find<HTMLInputElement>('[data-test="firestore-api-key"] input');
    expect(apiKeyInput.element.value).toBe('AIzaPastedKey123');
  });
});
