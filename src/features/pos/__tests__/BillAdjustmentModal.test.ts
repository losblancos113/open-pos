// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import BillAdjustmentModal from '../BillAdjustmentModal.vue';
import { createI18n } from 'vue-i18n';
import viMessages from '../../../i18n/vi.json';

describe('BillAdjustmentModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi: viMessages } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  it('renders discount tab and allows applying percentage discount', async () => {
    wrapper = mount(BillAdjustmentModal, {
      props: {
        open: true,
        initialTab: 'discount',
        subtotalMinor: 200000,
        maxDiscountPercent: 50,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.find('[data-test="discount-panel"]').exists()).toBe(true);

    const applyBtn = wrapper.find('[data-test="apply-discount-btn"]');
    await applyBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('apply-discount')).toBeTruthy();
    expect(wrapper.emitted('apply-discount')![0]![0]).toEqual({
      type: 'percent',
      value: 10,
      reason: undefined,
    });
  });

  it('switches to surcharge tab and allows applying surcharge', async () => {
    wrapper = mount(BillAdjustmentModal, {
      props: {
        open: true,
        initialTab: 'discount',
      },
      global: { plugins: [i18n] },
    });

    const tabSurcharge = wrapper.find('[data-test="tab-surcharge-btn"]');
    await tabSurcharge.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="surcharge-panel"]').exists()).toBe(true);

    const applyBtn = wrapper.find('[data-test="apply-surcharge-btn"]');
    await applyBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('apply-surcharge')).toBeTruthy();
    expect(wrapper.emitted('apply-surcharge')![0]![0]).toEqual({
      type: 'service_charge',
      name: 'Phí dịch vụ',
      ratePercent: 5,
    });
  });

  it('emits remove-discount when remove button is clicked', async () => {
    wrapper = mount(BillAdjustmentModal, {
      props: {
        open: true,
        initialTab: 'discount',
        currentDiscount: {
          type: 'percent',
          value: 10,
          reason: 'VIP',
        },
      },
      global: { plugins: [i18n] },
    });

    const removeBtn = wrapper.find('[data-test="remove-discount-btn"]');
    expect(removeBtn.exists()).toBe(true);

    await removeBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('remove-discount')).toBeTruthy();
  });

  it('switches to tax tab and allows setting custom % VAT', async () => {
    wrapper = mount(BillAdjustmentModal, {
      props: {
        open: true,
        initialTab: 'discount',
        currentTaxRate: 10,
        currentTaxMode: 'inclusive',
      },
      global: { plugins: [i18n] },
    });

    const tabTax = wrapper.find('[data-test="tab-tax-btn"]');
    await tabTax.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="tax-panel"]').exists()).toBe(true);

    // Click 8% VAT preset
    const preset8 = wrapper.find('[data-test="tax-preset-8"]');
    expect(preset8.exists()).toBe(true);
    await preset8.trigger('click');
    await nextTick();

    // Select exclusive mode
    const exclusiveRadio = wrapper.find('[data-test="adj-tax-mode-exclusive"]');
    await exclusiveRadio.setValue();
    await nextTick();

    const applyTaxBtn = wrapper.find('[data-test="apply-tax-btn"]');
    await applyTaxBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('set-tax')).toBeTruthy();
    expect(wrapper.emitted('set-tax')![0]![0]).toEqual({
      rate: 8,
      taxMode: 'exclusive',
    });
  });

  it('emits remove-tax when remove tax button is clicked', async () => {
    wrapper = mount(BillAdjustmentModal, {
      props: {
        open: true,
        initialTab: 'tax',
        currentTaxRate: 10,
      },
      global: { plugins: [i18n] },
    });

    const removeBtn = wrapper.find('[data-test="remove-tax-btn"]');
    expect(removeBtn.exists()).toBe(true);

    await removeBtn.trigger('click');
    await nextTick();

    expect(wrapper.emitted('remove-tax')).toBeTruthy();
  });
});
