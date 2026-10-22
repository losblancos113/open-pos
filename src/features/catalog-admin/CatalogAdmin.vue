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
import { format } from '@/core/money';
import type { ComboDoc } from '@/core/catalog/combo';
import type { BranchMenu, MenuItem } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ProductRecord } from '@/core/catalog/product';
import { ensureProductTypeDefinition } from '@/core/catalog/product-type';
import { slugify } from '@/core/slug';
import type { LocalizedText, TypeDefinition } from '@/core/types/definition';
import CategoryList from './CategoryList.vue';
import ComboEditor from './ComboEditor.vue';
import type { ComboFormValue } from './ComboEditor.vue';
import ModifierGroupEditor from './ModifierGroupEditor.vue';
import type { ModifierGroupFormValue } from './ModifierGroupEditor.vue';
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
  readonly key: 'categories' | 'products' | 'modifiers' | 'combos';
  readonly labelKey: string;
}

/** Chỉ những tab đã có màn hình thật — không render tab dẫn tới màn hình trắng. */
const TABS: readonly Tab[] = [
  { key: 'categories', labelKey: 'catalog.tab.categories' },
  { key: 'products', labelKey: 'catalog.tab.products' },
  { key: 'modifiers', labelKey: 'catalog.tab.modifiers' },
  { key: 'combos', labelKey: 'catalog.tab.combos' },
];

const activeTab = ref<Tab['key']>('categories');

const repository = createCatalogRepository(props.adapter);

const categories = ref<readonly CategoryDoc[]>([]);
const products = ref<readonly ProductRecord[]>([]);
const modifierGroups = ref<readonly ModifierGroupDoc[]>([]);
const combos = ref<readonly ComboDoc[]>([]);
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
    const [nextCategories, nextProducts, nextModifierGroups, nextCombos, definition, nextMenu] =
      await Promise.all([
        repository.listCategories(),
        repository.listProducts(),
        repository.listModifierGroups(),
        repository.listCombos(),
        // Type `product` của M1: tạo sẵn bản rỗng nếu chưa có để editor luôn có field tuỳ chỉnh.
        ensureProductTypeDefinition(props.adapter),
        repository.menu({ branchId: props.branchId, includeUnavailable: true }),
      ]);

    categories.value = nextCategories;
    products.value = nextProducts;
    modifierGroups.value = nextModifierGroups;
    combos.value = nextCombos;
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

// ---- Xác nhận xoá nhóm topping / combo -------------------------------------

/**
 * Một hộp thoại dùng chung cho hai loại tài liệu: cả hai đều chỉ cần tên để hỏi lại,
 * nên tách thành hai hộp thoại giống nhau chỉ tạo thêm chỗ để lệch nhau.
 */
type PendingRemoval =
  | { readonly kind: 'modifier'; readonly id: string; readonly label: string }
  | { readonly kind: 'combo'; readonly id: string; readonly label: string };

const pendingRemoval = ref<PendingRemoval | null>(null);
const removalOpen = ref(false);

watch(removalOpen, (open) => {
  if (!open) pendingRemoval.value = null;
});

const removalTitle = computed(() => {
  const target = pendingRemoval.value;
  if (target === null) return '';
  return target.kind === 'combo' ? t('catalog.combo.remove') : t('catalog.modifier.remove');
});

const removalMessage = computed(() => {
  const target = pendingRemoval.value;
  if (target === null) return '';
  return target.kind === 'combo'
    ? t('catalog.combo.removeConfirm', { name: target.label })
    : t('catalog.modifier.removeConfirm', { name: target.label });
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
  else await removeCombo(target.id);
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

    <div v-if="activeTab === 'modifiers'" class="catalog-admin__modifiers">
      <ModifierGroupEditor
        v-if="groupEditorOpen"
        :group="editingGroup"
        @save="saveGroup"
        @cancel="closeGroupEditor"
      />

      <template v-else>
        <Button.Root type="button" data-group-create @click="createGroup">
          {{ t('catalog.modifier.new') }}
        </Button.Root>

        <DataTable.Root>
          <DataTable.Table :aria-label="t('catalog.tab.modifiers')">
            <DataTable.Header>
              <DataTable.Row>
                <DataTable.Column id="name">{{ t('catalog.field.name') }}</DataTable.Column>
                <DataTable.Column id="min">{{ t('catalog.modifier.minSelect') }}</DataTable.Column>
                <DataTable.Column id="max">{{ t('catalog.modifier.maxSelect') }}</DataTable.Column>
                <DataTable.Column id="options">{{ t('catalog.modifier.options') }}</DataTable.Column>
                <DataTable.Column id="actions">{{ t('common.actions') }}</DataTable.Column>
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
                <DataTable.Cell>{{ group.name[activeLocale] }}</DataTable.Cell>
                <DataTable.Cell>{{ group.minSelect }}</DataTable.Cell>
                <DataTable.Cell>{{ group.maxSelect }}</DataTable.Cell>
                <DataTable.Cell>{{ group.options.length }}</DataTable.Cell>
                <DataTable.Cell>
                  <Button.Root
                    type="button"
                    :data-group-edit="group._id"
                    @click="editGroup(group._id)"
                  >
                    {{ t('common.edit') }}
                  </Button.Root>

                  <Button.Root
                    type="button"
                    :data-group-remove="group._id"
                    @click="askRemove('modifier', group._id, group.name[activeLocale])"
                  >
                    {{ t('common.delete') }}
                  </Button.Root>
                </DataTable.Cell>
              </DataTable.Row>

              <DataTable.Empty v-slot="{ columnCount }">
                <DataTable.Cell :colspan="columnCount">{{ t('catalog.modifier.empty') }}</DataTable.Cell>
              </DataTable.Empty>
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </template>
    </div>

    <div v-if="activeTab === 'combos'" class="catalog-admin__combos">
      <ComboEditor
        v-if="comboEditorOpen"
        :combo="editingCombo"
        :products="products"
        @save="saveCombo"
        @cancel="closeComboEditor"
      />

      <template v-else>
        <Button.Root type="button" data-combo-create @click="createCombo">
          {{ t('catalog.combo.new') }}
        </Button.Root>

        <DataTable.Root>
          <DataTable.Table :aria-label="t('catalog.tab.combos')">
            <DataTable.Header>
              <DataTable.Row>
                <DataTable.Column id="name">{{ t('catalog.field.name') }}</DataTable.Column>
                <DataTable.Column id="price">{{ t('catalog.field.basePrice') }}</DataTable.Column>
                <DataTable.Column id="groups">{{ t('catalog.combo.groups') }}</DataTable.Column>
                <DataTable.Column id="status">{{ t('catalog.product.active') }}</DataTable.Column>
                <DataTable.Column id="actions">{{ t('common.actions') }}</DataTable.Column>
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
                <DataTable.Cell>{{ combo.name[activeLocale] }}</DataTable.Cell>
                <DataTable.Cell>{{ format(combo.basePrice) }}</DataTable.Cell>
                <DataTable.Cell>{{ combo.comboGroups.length }}</DataTable.Cell>
                <DataTable.Cell>
                  {{ combo.isActive ? t('catalog.product.active') : t('catalog.product.inactive') }}
                </DataTable.Cell>
                <DataTable.Cell>
                  <Button.Root
                    type="button"
                    :data-combo-edit="combo._id"
                    @click="editCombo(combo._id)"
                  >
                    {{ t('common.edit') }}
                  </Button.Root>

                  <Button.Root
                    type="button"
                    :data-combo-remove="combo._id"
                    @click="askRemove('combo', combo._id, combo.name[activeLocale])"
                  >
                    {{ t('common.delete') }}
                  </Button.Root>
                </DataTable.Cell>
              </DataTable.Row>

              <DataTable.Empty v-slot="{ columnCount }">
                <DataTable.Cell :colspan="columnCount">{{ t('catalog.combo.empty') }}</DataTable.Cell>
              </DataTable.Empty>
            </DataTable.Body>
          </DataTable.Table>
        </DataTable.Root>
      </template>
    </div>

    <AlertDialog.Root v-model="removalOpen">
      <AlertDialog.Content data-removal-dialog>
        <AlertDialog.Title>{{ removalTitle }}</AlertDialog.Title>
        <AlertDialog.Description>{{ removalMessage }}</AlertDialog.Description>
        <AlertDialog.Cancel type="button">{{ t('common.cancel') }}</AlertDialog.Cancel>
        <AlertDialog.Action data-removal-confirm @action="confirmRemoval">
          {{ t('common.delete') }}
        </AlertDialog.Action>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </section>
</template>
