<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@vuetify/v0';
import type { BranchMenu, MenuItem } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ComboDoc } from '@/core/catalog/combo';
import type { ProductDoc } from '@/core/catalog/product';
import type { OrderLineItem } from '@/core/order/types';
import type { CatalogRepository } from '@/core/catalog/catalog-repository';
import { createCatalogRepository } from '@/core/catalog/catalog-repository';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { format } from '@/core/money';
import type { Money } from '@/core/money';
import type { LocalizedText } from '@/core/types/definition';
import ModifierPickerModal from './ModifierPickerModal.vue';
import ComboPickerModal from './ComboPickerModal.vue';

const props = withDefaults(
  defineProps<{
    menu?: BranchMenu | null;
    modifierGroups?: readonly ModifierGroupDoc[];
    combos?: readonly ComboDoc[];
    catalogRepository?: CatalogRepository | null;
    adapter?: DbAdapter | null;
    branchId?: string;
  }>(),
  {
    menu: null,
    modifierGroups: () => [],
    combos: () => [],
    catalogRepository: null,
    adapter: null,
    branchId: DEFAULT_BRANCH_ID,
  },
);

const emit = defineEmits<{
  (e: 'add-line', item: OrderLineItem): void;
}>();

const { t, locale } = useI18n();

// Dữ liệu nội bộ khi tải từ repository
const loadedMenu = ref<BranchMenu | null>(null);
const loadedModifierGroups = ref<readonly ModifierGroupDoc[]>([]);
const loadedCombos = ref<readonly ComboDoc[]>([]);

const effectiveRepository = computed<CatalogRepository | null>(() => {
  if (props.catalogRepository) return props.catalogRepository;
  if (props.adapter) return createCatalogRepository(props.adapter);
  return null;
});

async function loadCatalogData() {
  const repo = effectiveRepository.value;
  if (!repo || props.menu) return;

  try {
    const [menuRes, modRes, comboRes] = await Promise.all([
      repo.menu({ branchId: props.branchId }),
      repo.listModifierGroups(),
      repo.listCombos(),
    ]);
    loadedMenu.value = menuRes;
    loadedModifierGroups.value = modRes;
    loadedCombos.value = comboRes;
  } catch {
    // Bỏ qua lỗi kết nối / DB khi tải catalog
  }
}

onMounted(() => {
  if (!props.menu) {
    loadCatalogData();
  }
});

watch(
  () => props.branchId,
  () => {
    if (!props.menu) {
      loadCatalogData();
    }
  },
);

const effectiveMenu = computed<BranchMenu | null>(() => props.menu ?? loadedMenu.value);
const effectiveModifierGroups = computed<readonly ModifierGroupDoc[]>(
  () => (props.modifierGroups && props.modifierGroups.length > 0 ? props.modifierGroups : loadedModifierGroups.value),
);
const effectiveCombos = computed<readonly ComboDoc[]>(
  () => (props.combos && props.combos.length > 0 ? props.combos : loadedCombos.value),
);

// Tìm kiếm & phân loại danh mục
const searchQuery = ref<string>('');
const selectedCategoryId = ref<string>('all');

// Danh sách danh mục tabs
const categoryTabs = computed(() => {
  const tabs: Array<{ id: string; label: string }> = [
    { id: 'all', label: t('pos.catalog.all') },
  ];

  if (effectiveMenu.value) {
    for (const group of effectiveMenu.value.groups) {
      const id = group.category?._id ?? 'uncategorized';
      const label = group.category
        ? (group.category.name[locale.value as 'vi' | 'en'] || group.category.name.vi || group.category.name.en)
        : t('catalog.product.uncategorised');
      tabs.push({ id, label });
    }
  }

  if (effectiveCombos.value.length > 0) {
    tabs.push({ id: 'combos', label: t('pos.combo.badge') });
  }

  return tabs;
});

// Lọc danh sách món ăn
const filteredMenuItems = computed<MenuItem[]>(() => {
  if (!effectiveMenu.value) return [];
  let items: MenuItem[] = [];

  if (selectedCategoryId.value === 'all') {
    items = effectiveMenu.value.groups.flatMap((g) => g.items);
  } else if (selectedCategoryId.value === 'combos') {
    items = [];
  } else if (selectedCategoryId.value === 'uncategorized') {
    const uncatGroup = effectiveMenu.value.groups.find((g) => g.category === null);
    items = uncatGroup ? [...uncatGroup.items] : [];
  } else {
    const group = effectiveMenu.value.groups.find((g) => g.category?._id === selectedCategoryId.value);
    items = group ? [...group.items] : [];
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return items;

  return items.filter((item) => {
    const nameVi = item.product.name.vi?.toLowerCase() ?? '';
    const nameEn = item.product.name.en?.toLowerCase() ?? '';
    const barcode = item.product.barcode?.toLowerCase() ?? '';
    const sku = item.product.sku?.toLowerCase() ?? '';
    return nameVi.includes(query) || nameEn.includes(query) || barcode.includes(query) || sku.includes(query);
  });
});

// Lọc danh sách Combo
const filteredCombos = computed<ComboDoc[]>(() => {
  const activeList = effectiveCombos.value.filter((c) => c.isActive);
  let list: ComboDoc[] = [];

  if (selectedCategoryId.value === 'all' || selectedCategoryId.value === 'combos') {
    list = activeList;
  } else if (selectedCategoryId.value === 'uncategorized') {
    list = activeList.filter((c) => c.categoryId === null);
  } else {
    list = activeList.filter((c) => c.categoryId === selectedCategoryId.value);
  }

  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return list;

  return list.filter((combo) => {
    const nameVi = combo.name.vi?.toLowerCase() ?? '';
    const nameEn = combo.name.en?.toLowerCase() ?? '';
    return nameVi.includes(query) || nameEn.includes(query);
  });
});

// Trạng thái modal tuỳ chọn món & combo
const modifierModalOpen = ref<boolean>(false);
const activeModifierProduct = ref<ProductDoc | null>(null);
const activeModifierUnitPrice = ref<Money | null>(null);
const activeProductModifierGroups = ref<ModifierGroupDoc[]>([]);

const comboModalOpen = ref<boolean>(false);
const activeCombo = ref<ComboDoc | null>(null);

// Danh mục sản phẩm để phân giải tên trong combo
const allProducts = computed<ProductDoc[]>(() => {
  if (!effectiveMenu.value) return [];
  return effectiveMenu.value.groups.flatMap((g) => g.items.map((i) => i.product));
});

const allProductNames = computed<Map<string, LocalizedText>>(() => {
  const map = new Map<string, LocalizedText>();
  for (const p of allProducts.value) {
    map.set(p._id, p.name);
  }
  return map;
});

function handleProductClick(item: MenuItem) {
  if (!item.available) return;

  const hasVariants = Boolean(item.product.variants && item.product.variants.length > 0);
  const hasModifiers = Boolean(item.product.modifierGroupIds && item.product.modifierGroupIds.length > 0);

  if (hasVariants || hasModifiers) {
    // Tìm các modifier group tương ứng với món này
    const groups = effectiveModifierGroups.value.filter((g) =>
      item.product.modifierGroupIds?.includes(g._id),
    );
    activeModifierProduct.value = item.product;
    activeModifierUnitPrice.value = item.price;
    activeProductModifierGroups.value = groups;
    modifierModalOpen.value = true;
  } else {
    // Món đơn giản không có variant hay topping -> thêm vào đơn ngay
    const lineItem: OrderLineItem = {
      lineId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      productId: item.product._id,
      nameSnapshot: { vi: item.product.name.vi, en: item.product.name.en },
      unitPriceSnapshot: item.price,
      qty: 1,
      modifiers: [],
      status: 'placed',
      addedAt: new Date().toISOString(),
    };
    emit('add-line', lineItem);
  }
}

function handleComboClick(combo: ComboDoc) {
  if (!combo.isActive) return;
  activeCombo.value = combo;
  comboModalOpen.value = true;
}

function handleModalConfirm(item: OrderLineItem) {
  emit('add-line', item);
}
</script>

<template>
  <div class="pos-catalog-picker flex flex-col gap-3 h-full overflow-hidden" data-test="pos-catalog-picker">
    <!-- Thanh tìm kiếm và Tabs danh mục -->
    <div class="flex flex-col gap-2 shrink-0">
      <!-- Search input -->
      <Input.Root
        v-model="searchQuery"
        data-test="catalog-search"
        class="w-full"
      >
        <Input.Control
          class="field-input py-2 px-3 text-sm"
          :placeholder="t('pos.catalog.searchPlaceholder')"
        />
      </Input.Root>

      <!-- Category tabs -->
      <div class="overflow-x-auto pb-1">
        <Button.Group
          v-model="selectedCategoryId"
          mandatory
          class="inline-flex gap-1.5 p-1 bg-surface border border-border rounded-lg shadow-2xs whitespace-nowrap"
          data-test="category-tabs"
        >
          <Button.Root
            v-for="tab in categoryTabs"
            :key="tab.id"
            :value="tab.id"
            :data-category-id="tab.id"
            class="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-text-muted transition-all [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast font-semibold shadow-xs) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ tab.label }}
          </Button.Root>
        </Button.Group>
      </div>
    </div>

    <!-- Danh sách sản phẩm & combo (Lưới thẻ) -->
    <div class="flex-1 overflow-y-auto pr-1 min-h-0">
      <div
        v-if="filteredMenuItems.length === 0 && filteredCombos.length === 0"
        class="p-8 text-center text-text-muted my-auto"
        data-test="empty-catalog"
      >
        <p class="text-sm font-medium">{{ t('pos.catalog.noItems') }}</p>
      </div>

      <div
        v-else
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pb-2"
        data-test="product-grid"
      >
        <!-- Thẻ sản phẩm thường / có kích cỡ -->
        <Button.Root
          v-for="item in filteredMenuItems"
          :key="item.product._id"
          type="button"
          :data-product-id="item.product._id"
          :data-available="item.available ? '' : undefined"
          :disabled="!item.available"
          class="panel-card p-3 flex flex-col justify-between text-left cursor-pointer transition-all border border-border hover:(border-primary shadow-xs) active:scale-[0.98] disabled:(opacity-50 cursor-not-allowed hover:border-border) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary relative"
          @click="handleProductClick(item)"
        >
          <div class="flex flex-col gap-1 w-full">
            <div class="flex items-start justify-between gap-1">
              <span class="font-semibold text-sm text-text line-clamp-2 leading-snug">
                {{ item.product.name[locale as 'vi' | 'en'] || item.product.name.vi || item.product.name.en }}
              </span>
              <!-- Badge số lượng kích cỡ nếu có -->
              <span
                v-if="item.product.variants && item.product.variants.length > 0"
                class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-bg border border-border text-text-muted tracking-tight"
                data-test="variant-count-badge"
              >
                {{ t('pos.catalog.sizesCount', { count: item.product.variants.length }) }}
              </span>
            </div>
            <span v-if="item.product.unit" class="text-[11px] text-text-muted">
              {{ item.product.unit }}
            </span>
          </div>

          <div class="mt-3 flex items-baseline justify-between w-full">
            <span class="font-bold text-sm text-primary">
              {{ format(item.price) }}
            </span>
          </div>
        </Button.Root>

        <!-- Thẻ Combo -->
        <Button.Root
          v-for="combo in filteredCombos"
          :key="combo._id"
          type="button"
          :data-combo-id="combo._id"
          class="panel-card p-3 flex flex-col justify-between text-left cursor-pointer transition-all border border-primary/30 bg-primary/5 hover:(border-primary shadow-xs) active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary relative"
          @click="handleComboClick(combo)"
        >
          <div class="flex flex-col gap-1 w-full">
            <div class="flex items-start justify-between gap-1">
              <span class="font-semibold text-sm text-text line-clamp-2 leading-snug">
                {{ combo.name[locale as 'vi' | 'en'] || combo.name.vi || combo.name.en }}
              </span>
              <span
                class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary text-primary-contrast uppercase tracking-wider"
                data-test="combo-badge"
              >
                {{ t('pos.combo.badge') }}
              </span>
            </div>
          </div>

          <div class="mt-3 flex items-baseline justify-between w-full">
            <span class="font-bold text-sm text-primary">
              {{ format(combo.basePrice) }}
            </span>
          </div>
        </Button.Root>
      </div>
    </div>

    <!-- Modals chọn tuỳ chọn & combo -->
    <ModifierPickerModal
      v-model:open="modifierModalOpen"
      :product="activeModifierProduct"
      :unit-price="activeModifierUnitPrice"
      :modifier-groups="activeProductModifierGroups"
      @confirm="handleModalConfirm"
    />

    <ComboPickerModal
      v-model:open="comboModalOpen"
      :combo="activeCombo"
      :products="allProducts"
      :product-names="allProductNames"
      @confirm="handleModalConfirm"
    />
  </div>
</template>
