<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertDialog, Button, DataTable, Input } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { format } from '@/core/money';
import type { CategoryDoc } from '@/core/catalog/category';
import type { MenuItem } from '@/core/catalog/menu';
import type { PriceSourceKind } from '@/core/catalog/pricing';

/**
 * Danh sách món của một chi nhánh — đọc thẳng `MenuItem` đã resolve giá, nên cột giá ở
 * đây là **giá bán thật** (đã áp override/bảng giá của chi nhánh), không phải giá gốc.
 *
 * Component chỉ render + phát ý định; `CatalogAdmin` gọi repository và nạp lại.
 */

const props = defineProps<{
  items: readonly MenuItem[];
  categories: readonly CategoryDoc[];
  /** Món trỏ tới danh mục không tồn tại — cảnh báo, không ẩn món (D6). */
  danglingCategoryRefs: readonly string[];
}>();

const emit = defineEmits<{
  edit: [productId: string];
  create: [];
  remove: [productId: string];
}>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

/** Nhãn nguồn giá — người dùng cần biết vì sao món này đang bán giá đó. */
const PRICE_SOURCE_KEYS: Record<PriceSourceKind, string> = {
  override: 'catalog.priceSource.override',
  price_list: 'catalog.priceSource.priceList',
  base: 'catalog.priceSource.base',
};

const query = ref('');

/** Lọc theo tên (vi/en) hoặc mã vạch — quét mã vạch là cách tìm nhanh ở quầy. */
const filtered = computed<readonly MenuItem[]>(() => {
  const needle = query.value.trim().toLowerCase();
  if (needle === '') return props.items;

  return props.items.filter((item) => {
    const product = item.product;
    return (
      product.name.vi.toLowerCase().includes(needle) ||
      product.name.en.toLowerCase().includes(needle) ||
      (product.barcode ?? '').includes(needle)
    );
  });
});

const categoryNames = computed(
  () => new Map(props.categories.map((category) => [category._id, category.name[activeLocale.value]])),
);

function priceSourceText(item: MenuItem): string {
  return t(PRICE_SOURCE_KEYS[item.priceSource]);
}

function categoryText(item: MenuItem): string {
  const id = item.product.categoryId;
  if (id === null) return t('catalog.product.uncategorised');
  return categoryNames.value.get(id) ?? t('catalog.product.uncategorised');
}

/** `isActive` là toàn hệ thống; `available` đã tính cả 86'd của chi nhánh này. */
function statusText(item: MenuItem): string {
  if (!item.product.isActive) return t('catalog.product.inactive');
  if (!item.available) return t('catalog.product.unavailable');
  return t('catalog.product.active');
}

/** Tên món cho cảnh báo — `danglingCategoryRefs` chỉ có `_id`. */
const danglingNames = computed(() => {
  const byId = new Map(
    props.items.map((item) => [item.product._id, item.product.name[activeLocale.value]]),
  );
  return props.danglingCategoryRefs.map((id) => byId.get(id) ?? id);
});

const removalTarget = ref<MenuItem | null>(null);
const confirmOpen = ref(false);

watch(confirmOpen, (open) => {
  if (!open) removalTarget.value = null;
});

function askRemove(item: MenuItem): void {
  removalTarget.value = item;
  confirmOpen.value = true;
}

function confirmRemove(): void {
  const target = removalTarget.value;
  if (target !== null) emit('remove', target.product._id);
  confirmOpen.value = false;
}
</script>

<template>
  <section class="product-list">
    <div class="product-list__toolbar">
      <Input.Root
        v-model="query"
        data-product-filter
        type="text"
        :label="t('catalog.product.search')"
      >
        <Input.Control />
      </Input.Root>

      <Button.Root type="button" data-product-create @click="emit('create')">
        {{ t('catalog.product.new') }}
      </Button.Root>
    </div>

    <p v-if="danglingNames.length > 0" data-dangling-warning class="product-list__warning" role="status">
      {{ t('catalog.product.danglingCategory') }}: {{ danglingNames.join(', ') }}
    </p>

    <DataTable.Root>
      <DataTable.Table :aria-label="t('catalog.tab.products')">
        <DataTable.Header>
          <DataTable.Row>
            <DataTable.Column id="name">{{ t('catalog.field.name') }}</DataTable.Column>
            <DataTable.Column id="category">{{ t('catalog.field.category') }}</DataTable.Column>
            <DataTable.Column id="price">{{ t('catalog.field.basePrice') }}</DataTable.Column>
            <DataTable.Column id="barcode">{{ t('catalog.field.barcode') }}</DataTable.Column>
            <DataTable.Column id="status">{{ t('catalog.product.active') }}</DataTable.Column>
            <DataTable.Column id="actions">{{ t('common.actions') }}</DataTable.Column>
          </DataTable.Row>
        </DataTable.Header>

        <DataTable.Body>
          <DataTable.Row
            v-for="item in filtered"
            :id="item.product._id"
            :key="item.product._id"
            :value="item"
            :data-product-row="item.product._id"
          >
            <DataTable.Cell>{{ item.product.name[activeLocale] }}</DataTable.Cell>
            <DataTable.Cell>{{ categoryText(item) }}</DataTable.Cell>
            <DataTable.Cell>
              {{ format(item.price) }}
              <span class="product-list__source">{{ priceSourceText(item) }}</span>
            </DataTable.Cell>
            <DataTable.Cell>{{ item.product.barcode ?? '' }}</DataTable.Cell>
            <DataTable.Cell>{{ statusText(item) }}</DataTable.Cell>
            <DataTable.Cell>
              <Button.Root
                type="button"
                :data-product-edit="item.product._id"
                @click="emit('edit', item.product._id)"
              >
                {{ t('common.edit') }}
              </Button.Root>

              <Button.Root
                type="button"
                :data-product-remove="item.product._id"
                @click="askRemove(item)"
              >
                {{ t('common.delete') }}
              </Button.Root>
            </DataTable.Cell>
          </DataTable.Row>

          <DataTable.Empty v-slot="{ columnCount }">
            <DataTable.Cell :colspan="columnCount">{{ t('catalog.product.empty') }}</DataTable.Cell>
          </DataTable.Empty>
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>

    <AlertDialog.Root v-model="confirmOpen">
      <AlertDialog.Content data-product-remove-dialog>
        <AlertDialog.Title>{{ t('catalog.product.remove') }}</AlertDialog.Title>
        <AlertDialog.Description>
          {{ t('catalog.product.removeConfirm', { name: removalTarget?.product.name[activeLocale] ?? '' }) }}
        </AlertDialog.Description>
        <AlertDialog.Cancel type="button" data-product-remove-cancel>
          {{ t('common.cancel') }}
        </AlertDialog.Cancel>
        <AlertDialog.Action data-product-remove-confirm @action="confirmRemove">
          {{ t('common.delete') }}
        </AlertDialog.Action>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </section>
</template>
