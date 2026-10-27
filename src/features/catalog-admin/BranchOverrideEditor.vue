<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, DataTable, NumberField, Switch } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { format, minorUnitsPerMajor } from '@/core/money';
import type { CurrencyCode, Money } from '@/core/money';
import { parseMoneyInput } from '@/core/money-parse';
import type { MenuItem } from '@/core/catalog/menu';
import type { ProductOverrideDoc } from '@/core/catalog/override';
import type { PriceSourceKind } from '@/core/catalog/pricing';

/**
 * Tầng branch của catalog (§4.7): mỗi chi nhánh chỉ được đổi **giá**, **còn bán** và
 * **thứ tự** của một món. Tên, danh mục, kích cỡ… vẫn là của tầng global.
 *
 * Cột "giá đang bán" đọc thẳng `MenuItem.price`/`priceSource` — tức là giá đã resolve
 * (`override → price_list → base`) mà màn hình bán hàng sẽ dùng. Component **không**
 * tính lại giá: hai chỗ cùng tính giá là hai chỗ có thể lệch nhau, và ở quầy thì lệch
 * giá là lệch tiền.
 *
 * Mỗi lần sửa một ô là phát `set` cho cả dòng (`price`, `available`, `sortOrder`) rồi
 * cha ghi xuống store — `_rev` và thứ tự tầng do repository lo.
 */

const props = defineProps<{
  overrides: readonly ProductOverrideDoc[];
  /** Món của chi nhánh này, đã resolve giá — nguồn duy nhất cho cột "giá đang bán". */
  items: readonly MenuItem[];
  branchId: string;
}>();

const emit = defineEmits<{
  set: [
    value: {
      readonly productId: string;
      readonly price: Money | null;
      readonly available: boolean;
      readonly sortOrder: number | null;
    },
  ];
  clear: [productId: string];
}>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

const PRICE_SOURCE_KEYS: Record<PriceSourceKind, string> = {
  override: 'catalog.priceSource.override',
  price_list: 'catalog.priceSource.priceList',
  base: 'catalog.priceSource.base',
};

interface OverrideDraft {
  /** Đơn vị lớn (đúng thứ ô nhập hiển thị); `null` = dùng giá chung. */
  price: number | null;
  available: boolean;
  sortOrder: number | null;
}

const drafts = ref<Record<string, OverrideDraft>>({});

/** Món đã có override riêng ở chi nhánh này — quyết định nút "xoá giá riêng" hiện ra. */
const overriddenIds = computed(() => new Set(props.overrides.map((doc) => doc.productId)));

function draftFor(item: MenuItem): OverrideDraft {
  return (
    drafts.value[item.product._id] ?? { price: null, available: true, sortOrder: null }
  );
}

function currencyOf(item: MenuItem): CurrencyCode {
  return item.product.basePrice.currency;
}

/** Nạp bản nháp từ override đang có; giữ đúng thứ người dùng vừa gõ khi cha nạp lại. */
function seedDrafts(): void {
  const byProduct = new Map(props.overrides.map((doc) => [doc.productId, doc]));
  const next: Record<string, OverrideDraft> = {};

  for (const item of props.items) {
    const override = byProduct.get(item.product._id) ?? null;
    next[item.product._id] = {
      price:
        override === null || override.price === null
          ? null
          : override.price.minor / minorUnitsPerMajor(override.price.currency),
      available: override?.available ?? true,
      sortOrder: override?.sortOrder ?? null,
    };
  }

  drafts.value = next;
}

watch(() => [props.items, props.overrides], seedDrafts, { immediate: true });

/** Lỗi giá của từng dòng: chỉ hiện khi bản nháp không đổi được thành `Money` chính xác. */
const priceErrors = ref<Record<string, string>>({});

function priceErrorFor(item: MenuItem): string | null {
  return priceErrors.value[item.product._id] ?? null;
}

function setPriceError(productId: string, message: string | null): void {
  const next = { ...priceErrors.value };
  if (message === null) delete next[productId];
  else next[productId] = message;
  priceErrors.value = next;
}

/** Phát cả dòng chứ không phát từng ô: repository nhận một hình dạng override đầy đủ. */
function emitSet(item: MenuItem, patch: Partial<OverrideDraft>): void {
  const productId = item.product._id;
  const next = { ...draftFor(item), ...patch };
  drafts.value = { ...drafts.value, [productId]: next };

  let price: Money | null = null;
  if (next.price !== null) {
    try {
      price = parseMoneyInput(String(next.price), currencyOf(item));
    } catch (error) {
      // Giá không đổi được thành Money chính xác (ví dụ phần thập phân với VND):
      // không ghi gì và nói rõ, thay vì ghi một con số đã bị làm tròn.
      setPriceError(productId, error instanceof Error ? error.message : String(error));
      return;
    }
  }

  setPriceError(productId, null);
  emit('set', { productId, price, available: next.available, sortOrder: next.sortOrder });
}

function clearOverride(item: MenuItem): void {
  setPriceError(item.product._id, null);
  emit('clear', item.product._id);
}

function effectiveLabel(item: MenuItem): string {
  return t(PRICE_SOURCE_KEYS[item.priceSource]);
}
</script>

<template>
  <section class="grid gap-4">
    <h3 class="text-lg font-semibold">{{ t('catalog.tab.overrides') }}</h3>

    <p class="text-sm text-text-muted">{{ t('catalog.branch') }}: {{ branchId }}</p>

    <div class="panel-card overflow-x-auto">
      <DataTable.Root>
        <DataTable.Table :aria-label="t('catalog.tab.overrides')" class="w-full text-sm">
        <DataTable.Header>
          <DataTable.Row>
            <DataTable.Column id="name" class="table-cell">{{ t('catalog.field.name') }}</DataTable.Column>
            <DataTable.Column id="base" class="table-cell">{{ t('catalog.priceSource.base') }}</DataTable.Column>
            <DataTable.Column id="override" class="table-cell">{{ t('catalog.override.price') }}</DataTable.Column>
            <DataTable.Column id="effective" class="table-cell">{{ t('catalog.override.effective') }}</DataTable.Column>
            <DataTable.Column id="available" class="table-cell">{{ t('catalog.override.available') }}</DataTable.Column>
            <DataTable.Column id="sortOrder" class="table-cell">{{ t('catalog.override.sortOrder') }}</DataTable.Column>
            <DataTable.Column id="actions" class="table-cell">{{ t('common.actions') }}</DataTable.Column>
          </DataTable.Row>
        </DataTable.Header>

        <DataTable.Body>
          <DataTable.Row
            v-for="item in items"
            :id="item.product._id"
            :key="item.product._id"
            :value="item"
            :data-override-row="item.product._id"
          >
            <DataTable.Cell class="table-cell">{{ item.product.name[activeLocale] }}</DataTable.Cell>

            <DataTable.Cell class="table-cell">{{ format(item.product.basePrice) }}</DataTable.Cell>

            <DataTable.Cell class="table-cell">
              <NumberField.Root
                :data-override-price="item.product._id"
                :label="t('catalog.override.price')"
                :model-value="draftFor(item).price"
                :locale="activeLocale"
                :min="0"
                :step="1 / minorUnitsPerMajor(currencyOf(item))"
                @update:model-value="(value: number | null) => emitSet(item, { price: value })"
              >
                <NumberField.Control class="field-input" :placeholder="t('catalog.override.price')" />
              </NumberField.Root>

              <p
                v-if="priceErrorFor(item) !== null"
                class="error-text mt-1"
                role="alert"
              >
                {{ priceErrorFor(item) }}
              </p>
            </DataTable.Cell>

            <DataTable.Cell class="table-cell">
              <span :data-override-effective="item.product._id">
                {{ format(item.price) }}
                <span class="block text-sm text-text-muted">{{ effectiveLabel(item) }}</span>
              </span>
            </DataTable.Cell>

            <DataTable.Cell class="table-cell">
              <Switch.Root
                :data-override-available="item.product._id"
                class="btn-ghost data-[state=checked]:bg-primary data-[state=checked]:text-primary-contrast"
                :label="t('catalog.override.available')"
                :model-value="draftFor(item).available"
                @update:model-value="
                  (value: boolean | undefined) => emitSet(item, { available: value === true })
                "
              >
                {{
                  draftFor(item).available
                    ? t('catalog.product.active')
                    : t('catalog.product.unavailable')
                }}
              </Switch.Root>
            </DataTable.Cell>

            <DataTable.Cell class="table-cell">
              <NumberField.Root
                :data-override-sort-order="item.product._id"
                :label="t('catalog.field.sortOrder')"
                :model-value="draftFor(item).sortOrder"
                :locale="activeLocale"
                :min="0"
                :step="1"
                @update:model-value="(value: number | null) => emitSet(item, { sortOrder: value })"
              >
                <NumberField.Control class="field-input" :placeholder="t('catalog.field.sortOrder')" />
              </NumberField.Root>
            </DataTable.Cell>

            <DataTable.Cell class="table-cell">
              <Button.Root
                v-if="overriddenIds.has(item.product._id)"
                type="button"
                class="btn-danger"
                :data-override-clear="item.product._id"
                @click="clearOverride(item)"
              >
                {{ t('catalog.override.clear') }}
              </Button.Root>
            </DataTable.Cell>
          </DataTable.Row>

          <DataTable.Empty v-slot="{ columnCount }">
            <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('catalog.product.empty') }}</DataTable.Cell>
          </DataTable.Empty>
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  </div>
  </section>
</template>
