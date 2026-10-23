// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PosTerminal from '../PosTerminal.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';

describe('PosTerminal.vue shell', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    localStorage.clear();
  });

  it('renders terminal header with branch, terminal code, and mode switcher', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="pos-header"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="terminal-code"]').text()).toContain('T01');
    expect(wrapper.find('[data-test="mode-switch"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="branch-code"]').text()).toContain('HQ');
    expect(wrapper.find('[data-test="cashier-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="bank-settings-trigger"]').exists()).toBe(true);
  });

  it('toggles mode between floor plan and fast sale with split layout', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    // Default mode is floor
    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);

    // Switch to fast sale
    await wrapper.find('[data-test="mode-fast-sale"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);

    // Switch back to floor
    await wrapper.find('[data-test="mode-floor"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="floor-plan-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="fast-sale-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="ticket-panel"]').exists()).toBe(true);
  });

  it('persists and restores device profile from localStorage', async () => {
    localStorage.setItem(
      'openpos_device_profile',
      JSON.stringify({ terminalCode: 'T02', cashierName: 'Lê Văn B' }),
    );

    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="terminal-code"]').text()).toContain('T02');
    const cashierInput = wrapper.find('[data-test="cashier-name"] input');
    expect(cashierInput.exists()).toBe(true);
    expect((cashierInput.element as HTMLInputElement).value).toBe('Lê Văn B');

    // Update cashier name
    await cashierInput.setValue('Nguyễn Văn A');
    await nextTick();

    const stored = JSON.parse(localStorage.getItem('openpos_device_profile') ?? '{}');
    expect(stored.cashierName).toBe('Nguyễn Văn A');
    expect(stored.terminalCode).toBe('T02');
  });

  it('emits open-bank-settings when bank settings trigger is clicked', async () => {
    const adapter = await createMemoryAdapter();
    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="bank-settings-trigger"]').trigger('click');
    expect(wrapper.emitted('open-bank-settings')).toBeTruthy();
  });

  it('renders floor plan tables and emits select-table when table is clicked', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);
    await repo.saveArea({
      _id: 'area:hq:a1',
      branchId: 'hq',
      name: 'Tầng 1',
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });
    await repo.saveTable({
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:a1',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: '2026-10-24T00:00:00.000Z',
    });

    wrapper = mount(PosTerminal, {
      props: { adapter, branchId: 'hq' },
      global: { plugins: [i18n] },
    });

    await nextTick();
    await new Promise((r) => setTimeout(r, 20));
    await nextTick();

    const card = wrapper.find('[data-table-id="table:hq:t1"]');
    expect(card.exists()).toBe(true);
    expect(card.text()).toContain('B01');

    await card.trigger('click');
    expect(wrapper.emitted('select-table')?.[0]).toEqual(['table:hq:t1']);
    expect((wrapper.vm as unknown as { selectedTableId: string | null }).selectedTableId).toBe('table:hq:t1');
  });
});
