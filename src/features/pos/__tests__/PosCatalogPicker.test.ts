// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { VueWrapper } from '@vue/test-utils';
import PosCatalogPicker from '../PosCatalogPicker.vue';
import ModifierPickerModal from '../ModifierPickerModal.vue';
import ComboPickerModal from '../ComboPickerModal.vue';
import { money } from '../../../core/money';
import { createI18n } from 'vue-i18n';
import vi from '../../../i18n/vi.json';
import type { BranchMenu } from '../../../core/catalog/menu';
import type { ModifierGroupDoc } from '../../../core/catalog/modifier-group';
import type { ComboDoc } from '../../../core/catalog/combo';
import type { ProductDoc } from '../../../core/catalog/product';

describe('PosCatalogPicker.vue and option selection modals', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const simpleProduct: ProductDoc = {
    _id: 'product:p1',
    docType: 'catalog_product',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    categoryId: 'category:cat1',
    basePrice: money(65000, 'VND'),
    unit: 'tô',
    variants: [],
    modifierGroupIds: [],
    barcode: '893000000001',
    imageRef: null,
    sku: 'PHO-BO',
    sortOrder: 1,
    isActive: true,
  };

  const productWithVariants: ProductDoc = {
    _id: 'product:p2',
    docType: 'catalog_product',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    name: { vi: 'Cà phê sữa đá', en: 'Iced milk coffee' },
    categoryId: 'category:cat2',
    basePrice: money(30000, 'VND'),
    unit: 'ly',
    variants: [
      { id: 'size-m', name: { vi: 'Size M', en: 'Size M' }, priceDelta: money(0, 'VND') },
      { id: 'size-l', name: { vi: 'Size L', en: 'Size L' }, priceDelta: money(10000, 'VND') },
    ],
    modifierGroupIds: ['modifier_group:mg1'],
    barcode: '893000000002',
    imageRef: null,
    sku: 'CF-SUA',
    sortOrder: 2,
    isActive: true,
  };

  const modifierGroup: ModifierGroupDoc = {
    _id: 'modifier_group:mg1',
    docType: 'catalog_modifier_group',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    name: { vi: 'Topping trà sữa', en: 'Toppings' },
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 1,
    options: [
      { id: 'opt-tran-chau', name: { vi: 'Trân châu đen', en: 'Black pearl' }, priceDelta: money(5000, 'VND') },
      { id: 'opt-thach', name: { vi: 'Thạch dừa', en: 'Coconut jelly' }, priceDelta: money(5000, 'VND') },
      { id: 'opt-kem-cheese', name: { vi: 'Kem cheese', en: 'Cheese foam' }, priceDelta: money(12000, 'VND') },
    ],
  };

  const sampleCombo: ComboDoc = {
    _id: 'combo:cb1',
    docType: 'catalog_combo',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '2026-10-24T00:00:00.000Z',
    updatedAt: '2026-10-24T00:00:00.000Z',
    name: { vi: 'Combo Ăn Sáng', en: 'Breakfast Combo' },
    basePrice: money(80000, 'VND'),
    categoryId: 'category:cat1',
    imageRef: null,
    sortOrder: 1,
    isActive: true,
    comboGroups: [
      {
        key: 'main',
        label: { vi: 'Món chính', en: 'Main' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt-pho', productId: 'product:p1', priceDelta: money(0, 'VND') },
        ],
      },
      {
        key: 'drink',
        label: { vi: 'Đồ uống', en: 'Drink' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt-cf-m', productId: 'product:p2', priceDelta: money(0, 'VND') },
          { optionId: 'opt-cf-l', productId: 'product:p2', priceDelta: money(10000, 'VND') },
        ],
      },
    ],
  };

  const menu: BranchMenu = {
    branchId: 'hq',
    groups: [
      {
        category: {
          _id: 'category:cat1',
          docType: 'catalog_category',
          schemaVersion: 1,
          branchId: 'global',
          createdAt: '',
          updatedAt: '',
          name: { vi: 'Món ăn', en: 'Food' },
          sortOrder: 1,
        },
        items: [
          {
            product: simpleProduct,
            price: money(65000, 'VND'),
            priceSource: 'base',
            available: true,
            sortOrder: 1,
          },
        ],
      },
      {
        category: {
          _id: 'category:cat2',
          docType: 'catalog_category',
          schemaVersion: 1,
          branchId: 'global',
          createdAt: '',
          updatedAt: '',
          name: { vi: 'Đồ uống', en: 'Beverage' },
          sortOrder: 2,
        },
        items: [
          {
            product: productWithVariants,
            price: money(30000, 'VND'),
            priceSource: 'base',
            available: true,
            sortOrder: 2,
          },
        ],
      },
    ],
    byId: new Map([
      ['product:p1', { product: simpleProduct, price: money(65000, 'VND'), priceSource: 'base', available: true, sortOrder: 1 }],
      ['product:p2', { product: productWithVariants, price: money(30000, 'VND'), priceSource: 'base', available: true, sortOrder: 2 }],
    ]),
    byBarcode: new Map([
      ['893000000001', { product: simpleProduct, price: money(65000, 'VND'), priceSource: 'base', available: true, sortOrder: 1 }],
      ['893000000002', { product: productWithVariants, price: money(30000, 'VND'), priceSource: 'base', available: true, sortOrder: 2 }],
    ]),
    priceListId: null,
    danglingCategoryRefs: [],
  };

  it('renders category tabs and product cards with prices', () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Món ăn');
    expect(wrapper.text()).toContain('Đồ uống');
    expect(wrapper.text()).toContain('Phở bò');
    expect(wrapper.text()).toContain('65.000');
  });

  it('filters product cards by category tab', async () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    // Default: 'all' shows both products
    expect(wrapper.text()).toContain('Phở bò');
    expect(wrapper.text()).toContain('Cà phê sữa đá');

    // Click 'Đồ uống' tab
    const beverageTab = wrapper.find('[data-category-id="category:cat2"]');
    expect(beverageTab.exists()).toBe(true);
    await beverageTab.trigger('click');
    await nextTick();

    expect(wrapper.text()).not.toContain('Phở bò');
    expect(wrapper.text()).toContain('Cà phê sữa đá');
  });

  it('filters products by search bar input (name or barcode)', async () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    const searchInput = wrapper.find('[data-test="catalog-search"] input');
    expect(searchInput.exists()).toBe(true);

    // Filter by name
    await searchInput.setValue('phở');
    await nextTick();
    expect(wrapper.text()).toContain('Phở bò');
    expect(wrapper.text()).not.toContain('Cà phê sữa đá');

    // Filter by barcode
    await searchInput.setValue('893000000002');
    await nextTick();
    expect(wrapper.text()).not.toContain('Phở bò');
    expect(wrapper.text()).toContain('Cà phê sữa đá');
  });

  it('emits add-line directly when clicking a simple product', async () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    const simpleCard = wrapper.find('[data-product-id="product:p1"]');
    expect(simpleCard.exists()).toBe(true);
    await simpleCard.trigger('click');

    const emitted = wrapper.emitted('add-line');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]?.[0]).toMatchObject({
      productId: 'product:p1',
      nameSnapshot: { vi: 'Phở bò', en: 'Beef pho' },
      unitPriceSnapshot: money(65000, 'VND'),
      qty: 1,
      modifiers: [],
      status: 'placed',
    });
    const emittedItem = emitted?.[0]?.[0] as { lineId: string };
    expect(typeof emittedItem.lineId).toBe('string');
  });

  it('shows size count badge on products with variants and opens ModifierPickerModal on click', async () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    const variantCard = wrapper.find('[data-product-id="product:p2"]');
    expect(variantCard.exists()).toBe(true);
    expect(variantCard.text()).toMatch(/2\s*(size|kích cỡ)/i);

    await variantCard.trigger('click');
    await nextTick();

    // Modal is opened
    const modal = wrapper.findComponent(ModifierPickerModal);
    expect(modal.exists()).toBe(true);
    expect(modal.props('open')).toBe(true);
    expect(modal.props('product')?._id).toBe('product:p2');
  });

  it('renders combo card with Combo badge and opens ComboPickerModal on click', async () => {
    const wrapper = mount(PosCatalogPicker, {
      props: { menu, modifierGroups: [modifierGroup], combos: [sampleCombo] },
      global: { plugins: [i18n] },
    });

    const comboCard = wrapper.find('[data-combo-id="combo:cb1"]');
    expect(comboCard.exists()).toBe(true);
    expect(comboCard.text()).toContain('Combo Ăn Sáng');
    expect(comboCard.text()).toContain('80.000');

    await comboCard.trigger('click');
    await nextTick();

    const comboModal = wrapper.findComponent(ComboPickerModal);
    expect(comboModal.exists()).toBe(true);
    expect(comboModal.props('open')).toBe(true);
    expect(comboModal.props('combo')?._id).toBe('combo:cb1');
  });
});

describe('ModifierPickerModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const product: ProductDoc = {
    _id: 'product:p2',
    docType: 'catalog_product',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '',
    updatedAt: '',
    name: { vi: 'Cà phê sữa đá', en: 'Iced milk coffee' },
    categoryId: 'category:cat2',
    basePrice: money(30000, 'VND'),
    unit: 'ly',
    variants: [
      { id: 'size-m', name: { vi: 'Size M', en: 'Size M' }, priceDelta: money(0, 'VND') },
      { id: 'size-l', name: { vi: 'Size L', en: 'Size L' }, priceDelta: money(10000, 'VND') },
    ],
    modifierGroupIds: ['modifier_group:mg1'],
    barcode: '893000000002',
    imageRef: null,
    sku: 'CF-SUA',
    sortOrder: 2,
    isActive: true,
  };

  const modifierGroup: ModifierGroupDoc = {
    _id: 'modifier_group:mg1',
    docType: 'catalog_modifier_group',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '',
    updatedAt: '',
    name: { vi: 'Topping', en: 'Toppings' },
    minSelect: 0,
    maxSelect: 2,
    sortOrder: 1,
    options: [
      { id: 'opt-tc', name: { vi: 'Trân châu', en: 'Pearl' }, priceDelta: money(5000, 'VND') },
      { id: 'opt-thach', name: { vi: 'Thạch dừa', en: 'Jelly' }, priceDelta: money(5000, 'VND') },
      { id: 'opt-cheese', name: { vi: 'Kem cheese', en: 'Cheese' }, priceDelta: money(12000, 'VND') },
    ],
  };

  it('renders variants and modifiers with price calculation and emits confirm', async () => {
    wrapper = mount(ModifierPickerModal, {
      props: {
        open: true,
        product,
        unitPrice: money(30000, 'VND'),
        modifierGroups: [modifierGroup],
      },
      global: { plugins: [i18n] },
    });

    // Default base price: 30.000 + Size M (+0) = 30.000
    expect(wrapper.find('[data-test="modal-total-price"]').text()).toContain('30.000');

    // Select Size L (+10.000)
    const sizeLRadio = wrapper.find('[data-variant-id="size-l"]');
    expect(sizeLRadio.exists()).toBe(true);
    await sizeLRadio.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="modal-total-price"]').text()).toContain('40.000');

    // Select Topping Trân châu (+5.000)
    const topping1 = wrapper.find('[data-option-id="opt-tc"]');
    expect(topping1.exists()).toBe(true);
    await topping1.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-test="modal-total-price"]').text()).toContain('45.000');

    // Confirm button
    const confirmBtn = wrapper.find('[data-test="confirm-modifier-btn"]');
    await confirmBtn.trigger('click');

    const emitted = wrapper.emitted('confirm');
    expect(emitted).toBeTruthy();
    const item = emitted?.[0]?.[0];
    expect(item).toMatchObject({
      productId: 'product:p2',
      variantId: 'size-l',
      unitPriceSnapshot: money(45000, 'VND'),
      qty: 1,
      modifiers: [
        {
          groupId: 'modifier_group:mg1',
          optionId: 'opt-tc',
          priceDelta: money(5000, 'VND'),
        },
      ],
    });
  });

  it('enforces maxSelect limit on modifier groups', async () => {
    wrapper = mount(ModifierPickerModal, {
      props: {
        open: true,
        product,
        unitPrice: money(30000, 'VND'),
        modifierGroups: [modifierGroup], // maxSelect: 2
      },
      global: { plugins: [i18n] },
    });

    // Select topping 1 and topping 2
    await wrapper.find('[data-option-id="opt-tc"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-option-id="opt-thach"]').trigger('click');
    await nextTick();

    // Now 2 are selected, 3rd checkbox should be disabled or prevented
    const topping3 = wrapper.find('[data-option-id="opt-cheese"]');
    expect(topping3.attributes('disabled') !== undefined || topping3.attributes('data-disabled') !== undefined).toBe(true);
  });
});

describe('ComboPickerModal.vue', () => {
  const i18n = createI18n({ legacy: false, locale: 'vi', messages: { vi } });
  let wrapper: VueWrapper | null = null;

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
  });

  const sampleCombo: ComboDoc = {
    _id: 'combo:cb1',
    docType: 'catalog_combo',
    schemaVersion: 1,
    branchId: 'global',
    createdAt: '',
    updatedAt: '',
    name: { vi: 'Combo Ăn Sáng', en: 'Breakfast Combo' },
    basePrice: money(80000, 'VND'),
    categoryId: 'category:cat1',
    imageRef: null,
    sortOrder: 1,
    isActive: true,
    comboGroups: [
      {
        key: 'main',
        label: { vi: 'Món chính', en: 'Main' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt-pho', productId: 'product:p1', priceDelta: money(0, 'VND') },
          { optionId: 'opt-bun', productId: 'product:p3', priceDelta: money(5000, 'VND') },
        ],
      },
      {
        key: 'drink',
        label: { vi: 'Đồ uống', en: 'Drink' },
        minSelect: 1,
        maxSelect: 1,
        options: [
          { optionId: 'opt-cf-m', productId: 'product:p2', priceDelta: money(0, 'VND') },
          { optionId: 'opt-cf-l', productId: 'product:p2', priceDelta: money(10000, 'VND') },
        ],
      },
    ],
  };

  const productNames = new Map([
    ['product:p1', { vi: 'Phở bò', en: 'Pho' }],
    ['product:p2', { vi: 'Cà phê', en: 'Coffee' }],
    ['product:p3', { vi: 'Bún bò', en: 'Beef noodles' }],
  ]);

  it('renders combo groups, calculates delta price in real-time, and emits confirm', async () => {
    wrapper = mount(ComboPickerModal, {
      props: {
        open: true,
        combo: sampleCombo,
        productNames,
      },
      global: { plugins: [i18n] },
    });

    expect(wrapper.text()).toContain('Món chính');
    expect(wrapper.text()).toContain('Đồ uống');
    expect(wrapper.find('[data-test="combo-total-price"]').text()).toContain('80.000');

    // Select second main dish option (opt-bun: +5.000)
    await wrapper.find('[data-combo-option-id="opt-bun"]').trigger('click');
    await nextTick();

    // Select second drink option (opt-cf-l: +10.000)
    await wrapper.find('[data-combo-option-id="opt-cf-l"]').trigger('click');
    await nextTick();

    // Base 80.000 + 5.000 + 10.000 = 95.000
    expect(wrapper.find('[data-test="combo-total-price"]').text()).toContain('95.000');

    // Confirm
    const confirmBtn = wrapper.find('[data-test="confirm-combo-btn"]');
    await confirmBtn.trigger('click');

    const emitted = wrapper.emitted('confirm');
    expect(emitted).toBeTruthy();
    const item = emitted?.[0]?.[0];
    expect(item).toMatchObject({
      productId: 'combo:cb1',
      unitPriceSnapshot: money(95000, 'VND'),
      comboSelections: [
        { groupKey: 'main', optionIds: ['opt-bun'] },
        { groupKey: 'drink', optionIds: ['opt-cf-l'] },
      ],
      comboPriceDelta: money(15000, 'VND'),
      qty: 1,
      status: 'placed',
    });
  });
});
