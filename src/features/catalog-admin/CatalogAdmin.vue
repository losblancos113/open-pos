<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertDialog, Button, DataTable } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import type { CategoryPatch } from '@/core/catalog/catalog-repository';
import { createCatalogRepository } from '@/core/catalog/catalog-repository';
import type { CategoryDoc } from '@/core/catalog/category';
import {
  importCategoriesCsv,
  importProductsCsv,
  parseCategoriesCsv,
  parseProductsCsv,
} from '@/core/catalog/csv-catalog';
import type { CsvRowError, ImportSummary } from '@/core/catalog/csv-catalog';
import { format } from '@/core/money';
import type { CurrencyCode, Money } from '@/core/money';
import type { ComboDoc } from '@/core/catalog/combo';
import type { BranchMenu, MenuItem } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ProductOverrideDoc } from '@/core/catalog/override';
import { activePriceList } from '@/core/catalog/price-list';
import type { PriceListDoc } from '@/core/catalog/price-list';
import type { ProductRecord } from '@/core/catalog/product';
import { ensureProductTypeDefinition } from '@/core/catalog/product-type';
import { slugify } from '@/core/slug';
import type { LocalizedText, TypeDefinition } from '@/core/types/definition';
import BranchOverrideEditor from './BranchOverrideEditor.vue';
import CategoryList from './CategoryList.vue';
import ComboEditor from './ComboEditor.vue';
import type { ComboFormValue } from './ComboEditor.vue';
import CsvPanel from './CsvPanel.vue';
import ModifierGroupEditor from './ModifierGroupEditor.vue';
import type { ModifierGroupFormValue } from './ModifierGroupEditor.vue';
import PriceListEditor from './PriceListEditor.vue';
import type { PriceListFormValue } from './PriceListEditor.vue';
import ProductEditor from './ProductEditor.vue';
import type { ProductFormValue } from './ProductEditor.vue';
import ProductList from './ProductList.vue';

/**
 * Màn hình quản lý menu — nơi duy nhất sở hữu dữ liệu catalog.
 *
 * Các component con chỉ render và phát ý định (tạo/sửa/xoá); mọi lần ghi đi qua đây
 * rồi nạp lại từ store. Nhờ vậy danh sách luôn là thứ vừa đọc từ DB, không phải một
 * bản sao trong bộ nhớ có thể lệch khỏi `_rev` thật.
 *
 * `adapter` là prop bắt buộc để test bơm memory adapter — không có đường nào cho
 * component này tự mở PouchDB.
 *
 * Danh sách món đọc qua `repository.menu()` (kèm `includeUnavailable`) nên cột giá là
 * **giá hiệu dụng của chi nhánh** — đúng con số sẽ hiện ở màn hình bán hàng (M3).
 */

const props = withDefaults(defineProps<{ adapter: DbAdapter; branchId?: string }>(), {
  branchId: DEFAULT_BRANCH_ID,
});

const { t, locale } = useI18n();

/** Ngôn ngữ đang xem — tên món/nhóm là `LocalizedText` nên bảng phải chọn một bên. */
const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

interface Tab {
  readonly key:
    | 'categories'
    | 'products'
    | 'modifiers'
    | 'combos'
    | 'prices'
    | 'overrides'
    | 'csv';
  readonly labelKey: string;
}

/** Chỉ những tab đã có màn hình thật — không render tab dẫn tới màn hình trắng. */
const TABS: readonly Tab[] = [
  { key: 'categories', labelKey: 'catalog.tab.categories' },
  { key: 'products', labelKey: 'catalog.tab.products' },
  { key: 'modifiers', labelKey: 'catalog.tab.modifiers' },
  { key: 'combos', labelKey: 'catalog.tab.combos' },
  { key: 'prices', labelKey: 'catalog.tab.prices' },
  { key: 'overrides', labelKey: 'catalog.tab.overrides' },
  { key: 'csv', labelKey: 'catalog.tab.csv' },
];

const activeTab = ref<Tab['key']>('categories');

const repository = createCatalogRepository(props.adapter);

const categories = ref<readonly CategoryDoc[]>([]);
const products = ref<readonly ProductRecord[]>([]);
const modifierGroups = ref<readonly ModifierGroupDoc[]>([]);
const combos = ref<readonly ComboDoc[]>([]);
const priceLists = ref<readonly PriceListDoc[]>([]);
const overrides = ref<readonly ProductOverrideDoc[]>([]);
const productType = ref<TypeDefinition | null>(null);
const menu = ref<BranchMenu | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);

/** `null` = tạo món mới; chỉ có nghĩa khi `editorOpen`. */
const editingProductId = ref<string | null>(null);
const editorOpen = ref(false);

/** `null` = tạo nhóm topping mới; chỉ có nghĩa khi `groupEditorOpen`. */
const editingGroupId = ref<string | null>(null);
const groupEditorOpen = ref(false);

/** `null` = tạo combo mới; chỉ có nghĩa khi `comboEditorOpen`. */
const editingComboId = ref<string | null>(null);
const comboEditorOpen = ref(false);

/** `null` = tạo bảng giá mới; chỉ có nghĩa khi `priceEditorOpen`. */
const editingPriceListId = ref<string | null>(null);
const priceEditorOpen = ref(false);

const editingPriceList = computed<PriceListDoc | null>(() => {
  const id = editingPriceListId.value;
  if (id === null) return null;
  return priceLists.value.find((list) => list._id === id) ?? null;
});

/** Bảng giá đang áp cho chi nhánh — chọn bằng chính hàm của core, không tự suy luận. */
const activePriceListId = computed<string | null>(
  () => activePriceList(priceLists.value, new Date().toISOString())?._id ?? null,
);

const editingGroup = computed<ModifierGroupDoc | null>(() => {
  const id = editingGroupId.value;
  if (id === null) return null;
  return modifierGroups.value.find((group) => group._id === id) ?? null;
});

const editingCombo = computed<ComboDoc | null>(() => {
  const id = editingComboId.value;
  if (id === null) return null;
  return combos.value.find((combo) => combo._id === id) ?? null;
});

const menuItems = computed<readonly MenuItem[]>(() =>
  menu.value === null ? [] : menu.value.groups.flatMap((group) => group.items),
);

const danglingCategoryRefs = computed<readonly string[]>(
  () => menu.value?.danglingCategoryRefs ?? [],
);

const editingProduct = computed<ProductRecord | null>(() => {
  const id = editingProductId.value;
  if (id === null) return null;
  return products.value.find((product) => product._id === id) ?? null;
});

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reload(): Promise<void> {
  loadError.value = null;
  try {
    const [
      nextCategories,
      nextProducts,
      nextModifierGroups,
      nextCombos,
      nextPriceLists,
      nextOverrides,
      definition,
      nextMenu,
    ] = await Promise.all([
      repository.listCategories(),
      repository.listProducts(),
      repository.listModifierGroups(),
      repository.listCombos(),
      repository.listPriceLists(props.branchId),
      repository.listOverrides(props.branchId),
      // Type `product` của M1: tạo sẵn bản rỗng nếu chưa có để editor luôn có field tuỳ chỉnh.
      ensureProductTypeDefinition(props.adapter),
      repository.menu({ branchId: props.branchId, includeUnavailable: true }),
    ]);

    categories.value = nextCategories;
    products.value = nextProducts;
    modifierGroups.value = nextModifierGroups;
    combos.value = nextCombos;
    priceLists.value = nextPriceLists;
    overrides.value = nextOverrides;
    productType.value = definition;
    menu.value = nextMenu;
  } catch (error) {
    loadError.value = messageOf(error);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

/**
 * `_rev` là điều kiện chống ghi đè chéo giữa hai terminal. Document thiếu `_rev` là
 * bất thường — ném lỗi để hiện lên màn hình, không ghi mù đè lên bản của máy khác.
 */
function requireRev(doc: { readonly _id: string; readonly _rev?: string }): string {
  if (doc._rev === undefined) {
    throw new Error(`catalog document ${JSON.stringify(doc._id)} has no _rev`);
  }
  return doc._rev;
}

/** `_id` dạng `category:drinks` → segment `drinks` mà repository nhận. */
function categorySegment(docId: string): string {
  const prefix = 'category:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

/** `_id` dạng `product:pho-bo` → segment `pho-bo`. */
function productSegment(docId: string): string {
  const prefix = 'product:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

/** Chạy một lượt ghi rồi nạp lại; trả `true` khi thành công để chỗ gọi đóng form. */
async function run(action: () => Promise<unknown>): Promise<boolean> {
  saveError.value = null;
  try {
    await action();
    await reload();
    return true;
  } catch (error) {
    saveError.value = messageOf(error);
    return false;
  }
}

// ---- Category --------------------------------------------------------------

async function createCategory(name: LocalizedText, sortOrder: number): Promise<void> {
  await run(() => repository.createCategory({ id: slugify(name.vi), name, sortOrder }));
}

async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  const current = categories.value.find((category) => category._id === id);
  if (current === undefined) return;
  await run(() => repository.updateCategory(categorySegment(id), patch, requireRev(current)));
}

async function removeCategory(id: string): Promise<void> {
  const current = categories.value.find((category) => category._id === id);
  if (current === undefined) return;
  await run(() => repository.removeCategory(categorySegment(id), requireRev(current)));
}

// ---- Product ---------------------------------------------------------------

function createProduct(): void {
  editingProductId.value = null;
  editorOpen.value = true;
}

function editProduct(productId: string): void {
  editingProductId.value = productId;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  editingProductId.value = null;
}

/**
 * Field hệ thống + field tuỳ chỉnh đi chung một request: repository tách hai phần theo
 * type definition của M1, nên ở đây chỉ cần trải phẳng chúng ra.
 */
async function saveProduct(value: ProductFormValue): Promise<void> {
  const id = editingProductId.value;

  const saved = await run(async () => {
    const systemFields = {
      name: value.name,
      categoryId: value.categoryId,
      basePrice: value.basePrice,
      unit: value.unit,
      variants: value.variants,
      modifierGroupIds: value.modifierGroupIds,
      barcode: value.barcode,
      imageRef: value.imageRef,
      sku: value.sku,
      sortOrder: value.sortOrder,
      isActive: value.isActive,
    };

    if (id === null) {
      await repository.createProduct({
        id: slugify(value.name.vi),
        ...systemFields,
        ...value.customFields,
      });
      return;
    }

    const current = products.value.find((product) => product._id === id);
    if (current === undefined) throw new Error(`catalog_product ${JSON.stringify(id)} not found`);

    await repository.updateProduct(
      productSegment(id),
      { ...systemFields, ...value.customFields },
      requireRev(current),
    );
  });

  if (saved) closeEditor();
}

async function removeProduct(productId: string): Promise<void> {
  const current = products.value.find((product) => product._id === productId);
  if (current === undefined) return;

  const removed = await run(() =>
    repository.removeProduct(productSegment(productId), requireRev(current)),
  );
  if (removed && editingProductId.value === productId) closeEditor();
}

// ---- Modifier group --------------------------------------------------------

/** `_id` dạng `modifier_group:topping` → segment `topping`. */
function modifierGroupSegment(docId: string): string {
  const prefix = 'modifier_group:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

function createGroup(): void {
  editingGroupId.value = null;
  groupEditorOpen.value = true;
}

function editGroup(groupId: string): void {
  editingGroupId.value = groupId;
  groupEditorOpen.value = true;
}

function closeGroupEditor(): void {
  groupEditorOpen.value = false;
  editingGroupId.value = null;
}

async function saveGroup(value: ModifierGroupFormValue): Promise<void> {
  const id = editingGroupId.value;

  const saved = await run(async () => {
    const fields = {
      name: value.name,
      minSelect: value.minSelect,
      maxSelect: value.maxSelect,
      sortOrder: value.sortOrder,
      options: value.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
        ...(option.isDefault ? { isDefault: true } : {}),
      })),
    };

    if (id === null) {
      await repository.createModifierGroup({ id: slugify(value.name.vi), ...fields });
      return;
    }

    const current = modifierGroups.value.find((group) => group._id === id);
    if (current === undefined) {
      throw new Error(`catalog_modifier_group ${JSON.stringify(id)} not found`);
    }

    await repository.updateModifierGroup(modifierGroupSegment(id), fields, requireRev(current));
  });

  if (saved) closeGroupEditor();
}

async function removeGroup(groupId: string): Promise<void> {
  const current = modifierGroups.value.find((group) => group._id === groupId);
  if (current === undefined) return;

  const removed = await run(() =>
    repository.removeModifierGroup(modifierGroupSegment(groupId), requireRev(current)),
  );
  if (removed && editingGroupId.value === groupId) closeGroupEditor();
}

// ---- Combo -----------------------------------------------------------------

/** `_id` dạng `combo:com-trua` → segment `com-trua`. */
function comboSegment(docId: string): string {
  const prefix = 'combo:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

function createCombo(): void {
  editingComboId.value = null;
  comboEditorOpen.value = true;
}

function editCombo(comboId: string): void {
  editingComboId.value = comboId;
  comboEditorOpen.value = true;
}

function closeComboEditor(): void {
  comboEditorOpen.value = false;
  editingComboId.value = null;
}

async function saveCombo(value: ComboFormValue): Promise<void> {
  const id = editingComboId.value;

  const saved = await run(async () => {
    const fields = {
      name: value.name,
      basePrice: value.basePrice,
      comboGroups: value.comboGroups,
      categoryId: value.categoryId,
      imageRef: value.imageRef,
      sortOrder: value.sortOrder,
      isActive: value.isActive,
    };

    if (id === null) {
      await repository.createCombo({ id: slugify(value.name.vi), ...fields });
      return;
    }

    const current = combos.value.find((combo) => combo._id === id);
    if (current === undefined) throw new Error(`catalog_combo ${JSON.stringify(id)} not found`);

    await repository.updateCombo(comboSegment(id), fields, requireRev(current));
  });

  if (saved) closeComboEditor();
}

async function removeCombo(comboId: string): Promise<void> {
  const current = combos.value.find((combo) => combo._id === comboId);
  if (current === undefined) return;

  const removed = await run(() =>
    repository.removeCombo(comboSegment(comboId), requireRev(current)),
  );
  if (removed && editingComboId.value === comboId) closeComboEditor();
}

// ---- Price list (tầng branch) ----------------------------------------------

/** `_id` dạng `price_list:happy-hour` → segment `happy-hour`. */
function priceListSegment(docId: string): string {
  const prefix = 'price_list:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

function createPriceList(): void {
  editingPriceListId.value = null;
  priceEditorOpen.value = true;
}

function editPriceList(priceListId: string): void {
  editingPriceListId.value = priceListId;
  priceEditorOpen.value = true;
}

function closePriceEditor(): void {
  priceEditorOpen.value = false;
  editingPriceListId.value = null;
}

async function savePriceList(value: PriceListFormValue): Promise<void> {
  const id = editingPriceListId.value;

  const saved = await run(async () => {
    const fields = {
      name: value.name,
      effectiveFrom: value.effectiveFrom,
      effectiveTo: value.effectiveTo,
      priority: value.priority,
      entries: value.entries,
    };

    if (id === null) {
      // Bảng giá thuộc đúng chi nhánh đang quản lý — không có tầng global cho bảng giá.
      await repository.createPriceList({
        id: slugify(value.name.vi),
        branchId: props.branchId,
        ...fields,
      });
      return;
    }

    const current = priceLists.value.find((list) => list._id === id);
    if (current === undefined) throw new Error(`price_list ${JSON.stringify(id)} not found`);

    await repository.updatePriceList(priceListSegment(id), fields, requireRev(current));
  });

  if (saved) closePriceEditor();
}

async function removePriceList(priceListId: string): Promise<void> {
  const current = priceLists.value.find((list) => list._id === priceListId);
  if (current === undefined) return;

  const removed = await run(() =>
    repository.removePriceList(priceListSegment(priceListId), requireRev(current)),
  );
  if (removed && editingPriceListId.value === priceListId) closePriceEditor();
}

/** Giờ hiệu lực của một bảng giá — hiện gọn trong bảng, đủ để phân biệt các bảng. */
function windowText(list: PriceListDoc): string {
  const moment = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month} ${hour}:${minute}`;
  };

  const fromText = moment(list.effectiveFrom);
  if (list.effectiveTo === null) return `${fromText} →`;
  return `${fromText} → ${moment(list.effectiveTo)}`;
}

// ---- Product override (tầng branch) ----------------------------------------

/**
 * Ghi một override của chi nhánh. `setOverride` nhận `undefined` = giữ nguyên nên
 * component luôn gửi cả ba field — dòng là một hình dạng đầy đủ, không phải patch.
 */
async function setBranchOverride(value: {
  readonly productId: string;
  readonly price: Money | null;
  readonly available: boolean;
  readonly sortOrder: number | null;
}): Promise<void> {
  await run(() =>
    repository.setOverride({
      productId: value.productId,
      branchId: props.branchId,
      price: value.price,
      available: value.available,
      sortOrder: value.sortOrder,
    }),
  );
}

async function clearBranchOverride(productId: string): Promise<void> {
  await run(() => repository.clearOverride(productId, props.branchId));
}

// ---- CSV (xuất / nhập cả menu) ---------------------------------------------

/**
 * Trạng thái của lượt nhập CSV gần nhất. `CsvPanel` chỉ hiển thị; "hiện gì" quyết ở đây
 * vì chỉ chỗ này biết lượt nhập đã ghi xong hay còn đang chạy.
 */
const csvImporting = ref(false);
const csvErrors = ref<readonly CsvRowError[]>([]);
const csvImported = ref<{
  readonly kind: 'categories' | 'products';
  readonly summary: ImportSummary;
} | null>(null);

/** Tiền tệ của tệp CSV: theo món đầu tiên, chưa có món nào thì VND (như `PriceListEditor`). */
const csvCurrency = computed<CurrencyCode>(() => products.value[0]?.basePrice.currency ?? 'VND');

/**
 * Nhập danh mục từ CSV.
 *
 * Parse **trước** để có danh sách lỗi theo dòng: lỗi `importCategoriesCsv` ném ra là một
 * chuỗi gộp, không đủ để UI chỉ đúng dòng và cột cho người dùng sửa file. Parse là hàm
 * thuần nên chạy thêm một lần không đáng kể so với một lượt ghi.
 */
async function importCategoriesFromCsv(text: string): Promise<void> {
  csvErrors.value = [];
  csvImported.value = null;

  const { errors } = parseCategoriesCsv(text);
  if (errors.length > 0) {
    csvErrors.value = errors; // D7: có lỗi thì không ghi gì; file người dùng giữ nguyên.
    return;
  }

  csvImporting.value = true;
  try {
    const summary = await importCategoriesCsv(repository, text);
    csvImported.value = { kind: 'categories', summary };
    await reload();
  } catch (error) {
    // Lỗi không theo dòng (ví dụ document thiếu `_rev`): thông báo của core đã đủ rõ.
    saveError.value = messageOf(error);
  } finally {
    csvImporting.value = false;
  }
}

/** Nhập món từ CSV — cùng đường với danh mục, chỉ khác hàm core và tiền tệ của tệp. */
async function importProductsFromCsv(text: string): Promise<void> {
  csvErrors.value = [];
  csvImported.value = null;

  const { errors } = parseProductsCsv(text, { currency: csvCurrency.value });
  if (errors.length > 0) {
    csvErrors.value = errors;
    return;
  }

  csvImporting.value = true;
  try {
    const summary = await importProductsCsv(repository, text, { currency: csvCurrency.value });
    csvImported.value = { kind: 'products', summary };
    await reload();
  } catch (error) {
    saveError.value = messageOf(error);
  } finally {
    csvImporting.value = false;
  }
}

// ---- Xác nhận xoá nhóm topping / combo / bảng giá --------------------------

/**
 * Một hộp thoại dùng chung cho các loại tài liệu: mỗi loại chỉ cần tên để hỏi lại,
 * nên tách thành nhiều hộp thoại giống nhau chỉ tạo thêm chỗ để lệch nhau.
 */
type PendingRemoval =
  | { readonly kind: 'modifier'; readonly id: string; readonly label: string }
  | { readonly kind: 'combo'; readonly id: string; readonly label: string }
  | { readonly kind: 'price'; readonly id: string; readonly label: string };

const pendingRemoval = ref<PendingRemoval | null>(null);
const removalOpen = ref(false);

watch(removalOpen, (open) => {
  if (!open) pendingRemoval.value = null;
});

/** Nhãn hỏi lại và câu hỏi theo từng loại — chỉ khác nhau ở key i18n. */
const REMOVAL_KEYS: Record<PendingRemoval['kind'], { title: string; message: string }> = {
  modifier: {
    title: 'catalog.modifier.remove',
    message: 'catalog.modifier.removeConfirm',
  },
  combo: { title: 'catalog.combo.remove', message: 'catalog.combo.removeConfirm' },
  price: { title: 'catalog.price.remove', message: 'catalog.price.removeConfirm' },
};

const removalTitle = computed(() => {
  const target = pendingRemoval.value;
  if (target === null) return '';
  return t(REMOVAL_KEYS[target.kind].title);
});

const removalMessage = computed(() => {
  const target = pendingRemoval.value;
  if (target === null) return '';
  return t(REMOVAL_KEYS[target.kind].message, { name: target.label });
});

function askRemove(kind: PendingRemoval['kind'], id: string, label: string): void {
  pendingRemoval.value = { kind, id, label };
  removalOpen.value = true;
}

async function confirmRemoval(): Promise<void> {
  const target = pendingRemoval.value;
  removalOpen.value = false;
  if (target === null) return;

  if (target.kind === 'modifier') await removeGroup(target.id);
  else if (target.kind === 'combo') await removeCombo(target.id);
  else await removePriceList(target.id);
}
</script>

<template>
  <section class="grid gap-4">
    <h2 class="text-xl font-semibold">{{ t('catalog.title') }}</h2>

    <p v-if="loadError !== null" class="error-text" role="alert">{{ loadError }}</p>

    <nav class="w-full overflow-x-auto pb-1">
      <!--
        `Button.Group` để `aria-pressed` sống: ButtonRoot chỉ gắn nó khi có group, và merge
        attrs của nó sau attrs người dùng — ngoài group, `aria-pressed` bind ở đây bị ghi đè
        thành `undefined` (cùng lỗi đã thấy ở nav của App.vue khi chạy by-eye Task 19).
        `mandatory` giữ một tab luôn mở.
      -->
      <Button.Group v-model="activeTab" mandatory class="inline-flex gap-1 rounded-lg bg-surface p-1 border border-border shadow-2xs whitespace-nowrap">
        <Button.Root
          v-for="tab in TABS"
          :key="tab.key"
          type="button"
          :value="tab.key"
          :data-catalog-tab="tab.key"
          class="cursor-pointer rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast font-semibold shadow-xs) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t(tab.labelKey) }}
        </Button.Root>
      </Button.Group>
    </nav>

    <p v-if="loading" class="text-sm text-text-muted">{{ t('common.loading') }}</p>

    <p v-if="saveError !== null" class="error-text" role="alert">{{ saveError }}</p>

    <CategoryList
      v-if="activeTab === 'categories'"
      :categories="categories"
      @create="createCategory"
      @update="updateCategory"
      @remove="removeCategory"
    />

    <div v-if="activeTab === 'products'" class="grid gap-4">
      <ProductEditor
        v-if="editorOpen"
        :product="editingProduct"
        :categories="categories"
        :modifier-groups="modifierGroups"
        :product-type="productType"
        @save="saveProduct"
        @cancel="closeEditor"
      />

      <ProductList
        v-else
        :items="menuItems"
        :categories="categories"
        :dangling-category-refs="danglingCategoryRefs"
        @create="createProduct"
        @edit="editProduct"
        @remove="removeProduct"
      />
    </div>

    <div v-if="activeTab === 'modifiers'" class="grid gap-4">
      <ModifierGroupEditor
        v-if="groupEditorOpen"
        :group="editingGroup"
        @save="saveGroup"
        @cancel="closeGroupEditor"
      />

      <template v-else>
        <div>
          <Button.Root type="button" class="btn-primary" data-group-create @click="createGroup">
            {{ t('catalog.modifier.new') }}
          </Button.Root>
        </div>

        <div class="panel-card overflow-x-auto">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('catalog.tab.modifiers')" class="w-full text-sm">
            <DataTable.Header>
              <DataTable.Row>
                <DataTable.Column id="name" class="table-cell">{{ t('catalog.field.name') }}</DataTable.Column>
                <DataTable.Column id="min" class="table-cell">{{ t('catalog.modifier.minSelect') }}</DataTable.Column>
                <DataTable.Column id="max" class="table-cell">{{ t('catalog.modifier.maxSelect') }}</DataTable.Column>
                <DataTable.Column id="options" class="table-cell">{{ t('catalog.modifier.options') }}</DataTable.Column>
                <DataTable.Column id="actions" class="table-cell">{{ t('common.actions') }}</DataTable.Column>
              </DataTable.Row>
            </DataTable.Header>

            <DataTable.Body>
              <DataTable.Row
                v-for="group in modifierGroups"
                :id="group._id"
                :key="group._id"
                :value="group"
                :data-group-row="group._id"
              >
                <DataTable.Cell class="table-cell">{{ group.name[activeLocale] }}</DataTable.Cell>
                <DataTable.Cell class="table-cell">{{ group.minSelect }}</DataTable.Cell>
                <DataTable.Cell class="table-cell">{{ group.maxSelect }}</DataTable.Cell>
                <DataTable.Cell class="table-cell">{{ group.options.length }}</DataTable.Cell>
                <DataTable.Cell class="table-cell">
                  <div class="flex flex-wrap gap-1">
                    <Button.Root
                      type="button"
                      class="btn-ghost"
                      :data-group-edit="group._id"
                      @click="editGroup(group._id)"
                    >
                      {{ t('common.edit') }}
                    </Button.Root>

                    <Button.Root
                      type="button"
                      class="btn-danger"
                      :data-group-remove="group._id"
                      @click="askRemove('modifier', group._id, group.name[activeLocale])"
                    >
                      {{ t('common.delete') }}
                    </Button.Root>
                  </div>
                </DataTable.Cell>
              </DataTable.Row>

              <DataTable.Empty v-slot="{ columnCount }">
                <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('catalog.modifier.empty') }}</DataTable.Cell>
              </DataTable.Empty>
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </div>
      </template>
    </div>

    <div v-if="activeTab === 'combos'" class="grid gap-4">
      <ComboEditor
        v-if="comboEditorOpen"
        :combo="editingCombo"
        :products="products"
        @save="saveCombo"
        @cancel="closeComboEditor"
      />

      <template v-else>
        <div>
          <Button.Root type="button" class="btn-primary" data-combo-create @click="createCombo">
            {{ t('catalog.combo.new') }}
          </Button.Root>
        </div>

        <div class="panel-card overflow-x-auto">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('catalog.tab.combos')" class="w-full text-sm">
              <DataTable.Header>
                <DataTable.Row>
                  <DataTable.Column id="name" class="table-cell">{{ t('catalog.field.name') }}</DataTable.Column>
                  <DataTable.Column id="price" class="table-cell">{{ t('catalog.field.basePrice') }}</DataTable.Column>
                  <DataTable.Column id="groups" class="table-cell">{{ t('catalog.combo.groups') }}</DataTable.Column>
                  <DataTable.Column id="status" class="table-cell">{{ t('catalog.product.active') }}</DataTable.Column>
                  <DataTable.Column id="actions" class="table-cell">{{ t('common.actions') }}</DataTable.Column>
                </DataTable.Row>
              </DataTable.Header>

              <DataTable.Body>
                <DataTable.Row
                  v-for="combo in combos"
                  :id="combo._id"
                  :key="combo._id"
                  :value="combo"
                  :data-combo-row="combo._id"
                >
                  <DataTable.Cell class="table-cell">{{ combo.name[activeLocale] }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">{{ format(combo.basePrice) }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">{{ combo.comboGroups.length }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">
                    {{ combo.isActive ? t('catalog.product.active') : t('catalog.product.inactive') }}
                  </DataTable.Cell>
                  <DataTable.Cell class="table-cell">
                    <div class="flex flex-wrap gap-1">
                      <Button.Root
                        type="button"
                        class="btn-ghost"
                        :data-combo-edit="combo._id"
                        @click="editCombo(combo._id)"
                      >
                        {{ t('common.edit') }}
                      </Button.Root>

                      <Button.Root
                        type="button"
                        class="btn-danger"
                        :data-combo-remove="combo._id"
                        @click="askRemove('combo', combo._id, combo.name[activeLocale])"
                      >
                        {{ t('common.delete') }}
                      </Button.Root>
                    </div>
                  </DataTable.Cell>
                </DataTable.Row>

                <DataTable.Empty v-slot="{ columnCount }">
                  <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('catalog.combo.empty') }}</DataTable.Cell>
                </DataTable.Empty>
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </div>
      </template>
    </div>

    <div v-if="activeTab === 'prices'" class="grid gap-4">
      <PriceListEditor
        v-if="priceEditorOpen"
        :price-list="editingPriceList"
        :products="products"
        :branch-id="branchId"
        @save="savePriceList"
        @cancel="closePriceEditor"
      />

      <template v-else>
        <div>
          <Button.Root type="button" class="btn-primary" data-price-create @click="createPriceList">
            {{ t('catalog.price.new') }}
          </Button.Root>
        </div>

        <div class="panel-card overflow-x-auto">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('catalog.tab.prices')" class="w-full text-sm">
              <DataTable.Header>
                <DataTable.Row>
                  <DataTable.Column id="name" class="table-cell">{{ t('catalog.field.name') }}</DataTable.Column>
                  <DataTable.Column id="window" class="table-cell">
                    {{ t('catalog.price.effectiveFrom') }} — {{ t('catalog.price.effectiveTo') }}
                  </DataTable.Column>
                  <DataTable.Column id="priority" class="table-cell">{{ t('catalog.price.priority') }}</DataTable.Column>
                  <DataTable.Column id="entries" class="table-cell">{{ t('catalog.price.entries') }}</DataTable.Column>
                  <DataTable.Column id="actions" class="table-cell">{{ t('common.actions') }}</DataTable.Column>
                </DataTable.Row>
              </DataTable.Header>

              <DataTable.Body>
                <DataTable.Row
                  v-for="list in priceLists"
                  :id="list._id"
                  :key="list._id"
                  :value="list"
                  :data-price-row="list._id"
                >
                  <DataTable.Cell class="table-cell">
                    {{ list.name[activeLocale] }}
                    <span v-if="list._id === activePriceListId" class="ml-2 inline-block rounded-sm bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {{ t('catalog.price.active') }}
                    </span>
                  </DataTable.Cell>
                  <DataTable.Cell class="table-cell">{{ windowText(list) }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">{{ list.priority }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">{{ list.entries.length }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell">
                    <div class="flex flex-wrap gap-1">
                      <Button.Root
                        type="button"
                        class="btn-ghost"
                        :data-price-edit="list._id"
                        @click="editPriceList(list._id)"
                      >
                        {{ t('common.edit') }}
                      </Button.Root>

                      <Button.Root
                        type="button"
                        class="btn-danger"
                        :data-price-remove="list._id"
                        @click="askRemove('price', list._id, list.name[activeLocale])"
                      >
                        {{ t('common.delete') }}
                      </Button.Root>
                    </div>
                  </DataTable.Cell>
                </DataTable.Row>

                <DataTable.Empty v-slot="{ columnCount }">
                  <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('catalog.price.empty') }}</DataTable.Cell>
                </DataTable.Empty>
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </div>
      </template>
    </div>

    <BranchOverrideEditor
      v-if="activeTab === 'overrides'"
      :overrides="overrides"
      :items="menuItems"
      :branch-id="branchId"
      @set="setBranchOverride"
      @clear="clearBranchOverride"
    />

    <CsvPanel
      v-if="activeTab === 'csv'"
      :categories="categories"
      :products="products"
      :currency="csvCurrency"
      :importing="csvImporting"
      :errors="csvErrors"
      :imported="csvImported"
      @import-categories="importCategoriesFromCsv"
      @import-products="importProductsFromCsv"
    />

    <AlertDialog.Root v-model="removalOpen">
      <AlertDialog.Content
        class="panel-card fixed top-1/2 left-1/2 w-96 max-w-full -translate-x-1/2 -translate-y-1/2"
        data-removal-dialog
      >
        <AlertDialog.Title class="text-lg font-semibold">{{ removalTitle }}</AlertDialog.Title>
        <AlertDialog.Description class="mt-2 text-sm text-text-muted">{{ removalMessage }}</AlertDialog.Description>
        <div class="mt-4 flex justify-end gap-2">
          <AlertDialog.Cancel type="button" class="btn-ghost">{{ t('common.cancel') }}</AlertDialog.Cancel>
          <AlertDialog.Action class="btn-danger" data-removal-confirm @action="confirmRemoval">
            {{ t('common.delete') }}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </section>
</template>
