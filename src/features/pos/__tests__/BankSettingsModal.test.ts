// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import BankSettingsModal from '../BankSettingsModal.vue';
import { createMemoryAdapter } from '../../../core/db/memory-adapter';
import { createOrderRepository } from '../../../core/order/order-repository';
import type { BankAccountDoc } from '../../../core/qr/bank-account';
import { BANK_PRESETS } from '../../../core/qr/bank-account';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';

describe('BankSettingsModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders bank select, account number, and account name fields', () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="bank-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="account-number"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="account-name"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="save-bank-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="cancel-bank-btn"]').exists()).toBe(true);
  });

  it('prepopulates fields when currentAccount matching a preset is provided', () => {
    const currentAccount: BankAccountDoc = {
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount },
      global: { plugins: [i18n] },
    });

    const accountNumInput = wrapper.find('[data-test="account-number"] input');
    const accountNameInput = wrapper.find('[data-test="account-name"] input');

    expect((accountNumInput.element as HTMLInputElement).value).toBe('0901234567');
    expect((accountNameInput.element as HTMLInputElement).value).toBe('NGUYEN VAN A');
    // Custom BIN input should not be shown for standard presets
    expect(wrapper.find('[data-test="custom-bin"]').exists()).toBe(false);
  });

  it('shows custom BIN and bank name fields when currentAccount is not in presets', () => {
    const customAccount: BankAccountDoc = {
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970499',
      bankName: 'Custom Fintech Bank',
      accountNumber: '88889999',
      accountName: 'TRAN VAN B',
      updatedAt: '2026-10-24T00:00:00.000Z',
    };

    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: customAccount },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="custom-bin"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="custom-bank-name"]').exists()).toBe(true);

    const binInput = wrapper.find('[data-test="custom-bin"] input');
    const bankNameInput = wrapper.find('[data-test="custom-bank-name"] input');
    expect((binInput.element as HTMLInputElement).value).toBe('970499');
    expect((bankNameInput.element as HTMLInputElement).value).toBe('Custom Fintech Bank');
  });

  it('filters non-numeric characters from account number input', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    const accountNumInput = wrapper.find('[data-test="account-number"] input');
    await accountNumInput.setValue('090-123.456 abc 789');
    await nextTick();

    expect((accountNumInput.element as HTMLInputElement).value).toBe('090123456789');
  });

  it('normalizes account name to unaccented uppercase', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    const accountNameInput = wrapper.find('[data-test="account-name"] input');
    await accountNameInput.setValue('Nguyễn Văn Định');
    await nextTick();

    expect((accountNameInput.element as HTMLInputElement).value).toBe('NGUYEN VAN DINH');
  });

  it('auto-fills bankBin and bankName when selecting a preset bank', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    // Preset list should include standard banks
    const presetOptions = wrapper.findAll('[role="option"]');
    expect(presetOptions.length).toBeGreaterThanOrEqual(BANK_PRESETS.length);

    // Select Vietcombank (970436)
    const vcbOption = presetOptions.find((opt) => opt.text().includes('Vietcombank') || opt.text().includes('970436'));
    expect(vcbOption).toBeDefined();
    await vcbOption!.trigger('click');
    await nextTick();

    // Verify custom BIN input is not shown
    expect(wrapper.find('[data-test="custom-bin"]').exists()).toBe(false);
  });

  it('switches to custom bank mode and allows manual BIN and bank name input', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    // Select custom option
    const presetOptions = wrapper.findAll('[role="option"]');
    const customOption = presetOptions.find((opt) => opt.attributes('data-value') === 'custom' || opt.text().includes('khác') || opt.text().includes('Other'));
    expect(customOption).toBeDefined();
    await customOption!.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="custom-bin"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="custom-bank-name"]').exists()).toBe(true);

    const binInput = wrapper.find('[data-test="custom-bin"] input');
    const bankNameInput = wrapper.find('[data-test="custom-bank-name"] input');

    await binInput.setValue('970499');
    await bankNameInput.setValue('Custom Bank');
    await nextTick();

    expect((binInput.element as HTMLInputElement).value).toBe('970499');
    expect((bankNameInput.element as HTMLInputElement).value).toBe('Custom Bank');
  });

  it('disables save button when required fields are missing', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    const saveBtn = wrapper.find('[data-test="save-bank-btn"]');
    expect(saveBtn.attributes('disabled')).toBeDefined();
  });

  it('saves bank account to orderRepository, emits save, and closes dialog on submit', async () => {
    const adapter = await createMemoryAdapter();
    const orderRepository = createOrderRepository(adapter);

    wrapper = mount(BankSettingsModal, {
      props: {
        open: true,
        branchId: 'branch-1',
        orderRepository,
        currentAccount: null,
      },
      global: { plugins: [i18n] },
    });

    // Select MBBank preset (970422)
    const presetOptions = wrapper.findAll('[role="option"]');
    const mbOption = presetOptions.find((opt) => opt.text().includes('MBBank') || opt.text().includes('970422'));
    await mbOption!.trigger('click');
    await nextTick();

    // Enter account number & name
    const accountNumInput = wrapper.find('[data-test="account-number"] input');
    const accountNameInput = wrapper.find('[data-test="account-name"] input');

    await accountNumInput.setValue('0987654321');
    await accountNameInput.setValue('Nguyễn Thị Thảo');
    await nextTick();

    const saveBtn = wrapper.find('[data-test="save-bank-btn"]');
    expect(saveBtn.attributes('disabled')).toBeUndefined();

    await saveBtn.trigger('click');
    await nextTick();

    // Check emitted save event
    const emittedSave = wrapper.emitted('save');
    expect(emittedSave).toBeTruthy();
    const savedDoc = emittedSave?.[0]?.[0] as BankAccountDoc;
    expect(savedDoc).toMatchObject({
      _id: 'bank_account:branch-1',
      branchId: 'branch-1',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '0987654321',
      accountName: 'NGUYEN THI THAO',
    });

    // Check saved in repository
    const stored = await orderRepository.getBankAccount('branch-1');
    expect(stored).not.toBeNull();
    expect(stored?.accountNumber).toBe('0987654321');
    expect(stored?.accountName).toBe('NGUYEN THI THAO');
    expect(stored?.bankBin).toBe('970422');

    // Check modal close emitted
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });

  it('emits update:open(false) when cancel button is clicked', async () => {
    wrapper = mount(BankSettingsModal, {
      props: { open: true, currentAccount: null },
      global: { plugins: [i18n] },
    });

    await wrapper.find('[data-test="cancel-bank-btn"]').trigger('click');
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
  });
});
