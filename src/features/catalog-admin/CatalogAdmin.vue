<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import type { CategoryPatch } from '@/core/catalog/catalog-repository';
import { createCatalogRepository } from '@/core/catalog/catalog-repository';
import type { CategoryDoc } from '@/core/catalog/category';
import type { BranchMenu, MenuItem } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ProductRecord } from '@/core/catalog/product';
import { ensureProductTypeDefinition } from '@/core/catalog/product-type';
import { slugify } from '@/core/slug';
import type { LocalizedText, TypeDefinition } from '@/core/types/definition';
import CategoryList from './CategoryList.vue';
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

const { t } = useI18n();

interface Tab {
  readonly key: 'categories' | 'products';
  readonly labelKey: string;
}

/** Chỉ những tab đã có màn hình thật — không render tab dẫn tới màn hình trắng. */
const TABS: readonly Tab[] = [
  { key: 'categories', labelKey: 'catalog.tab.categories' },
  { key: 'products', labelKey: 'catalog.tab.products' },
];

const activeTab = ref<Tab['key']>('categories');

const repository = createCatalogRepository(props.adapter);

const categories = ref<readonly CategoryDoc[]>([]);
const products = ref<readonly ProductRecord[]>([]);
const modifierGroups = ref<readonly ModifierGroupDoc[]>([]);
const productType = ref<TypeDefinition | null>(null);
const menu = ref<BranchMenu | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);

/** `null` = tạo món mới; chỉ có nghĩa khi `editorOpen`. */
const editingProductId = ref<string | null>(null);
const editorOpen = ref(false);

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
    const [nextCategories, nextProducts, nextModifierGroups, definition, nextMenu] =
      await Promise.all([
        repository.listCategories(),
        repository.listProducts(),
        repository.listModifierGroups(),
        // Type `product` của M1: tạo sẵn bản rỗng nếu chưa có để editor luôn có field tuỳ chỉnh.
        ensureProductTypeDefinition(props.adapter),
        repository.menu({ branchId: props.branchId, includeUnavailable: true }),
      ]);

    categories.value = nextCategories;
    products.value = nextProducts;
    modifierGroups.value = nextModifierGroups;
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
</script>

<template>
  <section class="catalog-admin">
    <h2>{{ t('catalog.title') }}</h2>

    <p v-if="loadError !== null" role="alert">{{ loadError }}</p>

    <nav class="catalog-admin__tabs">
      <Button.Root
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        :data-catalog-tab="tab.key"
        :aria-pressed="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ t(tab.labelKey) }}
      </Button.Root>
    </nav>

    <p v-if="loading">{{ t('common.loading') }}</p>

    <p v-if="saveError !== null" role="alert">{{ saveError }}</p>

    <CategoryList
      v-if="activeTab === 'categories'"
      :categories="categories"
      @create="createCategory"
      @update="updateCategory"
      @remove="removeCategory"
    />

    <div v-if="activeTab === 'products'" class="catalog-admin__products">
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
  </section>
</template>
