<script lang="ts">
import type { Money } from '@/core/money';
import type { LocalizedText } from '@/core/types/definition';

export interface PriceListEntryFormValue {
  readonly productId: string;
  /** `null` = áp cho mọi kích cỡ của món. */
  readonly variantId: string | null;
  readonly price: Money;
}

/**
 * Giá trị form của một bảng giá — hợp đồng giữa `PriceListEditor` và `CatalogAdmin`.
 * Khai ở khối `<script>` thường để export được cho cha dùng.
 */
export interface PriceListFormValue {
  readonly name: LocalizedText;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly priority: number;
  readonly entries: readonly PriceListEntryFormValue[];
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, NumberField, Select } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { createEnvelope } from '@/core/db/envelope';
import { priceListDocId } from '@/core/db/ids';
import { minorUnitsPerMajor } from '@/core/money';
import type { CurrencyCode } from '@/core/money';
import { parseMoneyInput } from '@/core/money-parse';
import { PRICE_LIST_DOC_TYPE, validatePriceList } from '@/core/catalog/price-list';
import type { PriceListDoc } from '@/core/catalog/price-list';
import type { ProductDoc, ProductVariant } from '@/core/catalog/product';
import type { CatalogIssue, CatalogValidationCode } from '@/core/catalog/validation';

/**
 * Form sửa một bảng giá của chi nhánh — "giờ vàng 14:00–17:00", "menu tết".
 *
 * Lỗi hiển thị lấy thẳng từ `validatePriceList` của core: cùng nguồn chân lý với lúc
 * ghi, nên UI không bao giờ báo "hợp lệ" cho thứ mà repository sẽ từ chối.
 *
 * Một mặt hàng trỏ tới đúng một kích cỡ (`variantId`) hoặc mọi kích cỡ (`null`). Giá
 * theo kích cỡ là giá **tuyệt đối** — nhập 60.000 cho "Tô lớn" nghĩa là tô lớn bán
 * 60.000, không cộng thêm chênh lệch của kích cỡ (xem `resolveProductPrice`).
 */

const props = defineProps<{
  /** `null` = tạo bảng giá mới. */
  priceList: PriceListDoc | null;
  products: readonly ProductDoc[];
  branchId: string;
}>();

const emit = defineEmits<{ save: [value: PriceListFormValue]; cancel: [] }>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

const ALL_VARIANTS = '__all__';

/** Tiền tệ của chi nhánh: theo bảng giá đang sửa, rồi tới món đầu tiên, cuối cùng là VND. */
const currency = computed<CurrencyCode>(
  () =>
    props.priceList?.entries[0]?.price.currency ??
    props.products[0]?.basePrice.currency ??
    'VND',
);

interface EntryDraft {
  /** `''` = chưa chọn món. */
  productId: string;
  /** `ALL_VARIANTS` = áp cho mọi kích cỡ. */
  variantId: string;
  /** Đơn vị lớn (đúng thứ ô nhập hiển thị); đổi sang `Money` khi lưu. */
  price: number | null;
}

const nameVi = ref('');
const nameEn = ref('');
const fromLocal = ref('');
const toLocal = ref('');
const priority = ref(0);
const entries = ref<EntryDraft[]>([]);
const submitted = ref(false);

/** ISO (UTC) → giá trị mà `<input type="datetime-local">` hiểu được (giờ địa phương). */
function toDatetimeLocal(value: string): string {
  if (value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Giá trị của `<input type="datetime-local">` → ISO có `Z`. */
function fromDatetimeLocal(value: string): string | null {
  if (value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function loadFrom(priceList: PriceListDoc | null): void {
  nameVi.value = priceList?.name.vi ?? '';
  nameEn.value = priceList?.name.en ?? '';
  fromLocal.value = toDatetimeLocal(priceList?.effectiveFrom ?? '');
  toLocal.value = toDatetimeLocal(priceList?.effectiveTo ?? '');
  priority.value = priceList?.priority ?? 0;
  entries.value = (priceList?.entries ?? []).map((entry) => ({
    productId: entry.productId,
    variantId: entry.variantId ?? ALL_VARIANTS,
    price: entry.price.minor / minorUnitsPerMajor(entry.price.currency),
  }));
  submitted.value = false;
}

watch(() => props.priceList, loadFrom, { immediate: true });

const productById = computed(() => new Map(props.products.map((product) => [product._id, product])));

function variantsOf(productId: string): readonly ProductVariant[] {
  return productById.value.get(productId)?.variants ?? [];
}

function productLabel(productId: string): string {
  if (productId === '') return '';
  const product = productById.value.get(productId);
  return product === undefined ? productId : product.name[activeLocale.value];
}

function variantLabel(entry: EntryDraft): string {
  if (entry.variantId === ALL_VARIANTS) return t('catalog.price.allVariants');
  const variant = variantsOf(entry.productId).find((candidate) => candidate.id === entry.variantId);
  return variant === undefined ? entry.variantId : variant.name[activeLocale.value];
}

function localizedName(): LocalizedText {
  const vi = nameVi.value.trim();
  const en = nameEn.value.trim();
  return { vi, en: en === '' ? vi : en };
}

function updateEntry(index: number, patch: Partial<EntryDraft>): void {
  entries.value = entries.value.map((entry, position) =>
    position === index ? { ...entry, ...patch } : entry,
  );
}

/** Đổi món thì kích cỡ cũ không còn nghĩa — quay về "mọi kích cỡ". */
function setEntryProduct(index: number, value: unknown): void {
  const productId = typeof value === 'string' ? value : '';
  updateEntry(index, { productId, variantId: ALL_VARIANTS });
}

function setEntryVariant(index: number, value: unknown): void {
  updateEntry(index, { variantId: typeof value === 'string' ? value : ALL_VARIANTS });
}

function addEntry(): void {
  entries.value = [...entries.value, { productId: '', variantId: ALL_VARIANTS, price: null }];
}

function removeEntry(index: number): void {
  entries.value = entries.value.filter((_, position) => position !== index);
}

/** Dòng đã điền đủ — dòng còn dở bị báo riêng thay vì đẩy vào core. */
function completeEntries(): readonly (EntryDraft & { price: number })[] {
  return entries.value.filter(
    (entry): entry is EntryDraft & { price: number } =>
      entry.productId !== '' && entry.price !== null,
  );
}

function entryPayload(): PriceListEntryFormValue[] {
  return completeEntries().map((entry) => ({
    productId: entry.productId,
    variantId: entry.variantId === ALL_VARIANTS ? null : entry.variantId,
    price: parseMoneyInput(String(entry.price), currency.value),
  }));
}

/** Ứng viên để core chấm — envelope chỉ để đủ hình dạng, không ghi đi đâu. */
function candidateDoc(): PriceListDoc {
  const id = props.priceList?._id ?? 'price_list:draft';
  const segment = id.startsWith('price_list:') ? id.slice('price_list:'.length) : id;

  return {
    ...createEnvelope({
      id: priceListDocId(segment),
      docType: PRICE_LIST_DOC_TYPE,
      branchId: props.branchId,
    }),
    name: localizedName(),
    effectiveFrom: fromDatetimeLocal(fromLocal.value) ?? '',
    effectiveTo: fromDatetimeLocal(toLocal.value),
    priority: priority.value,
    entries: entryPayload(),
  };
}

/** Mã lỗi nào có bản dịch thì hiện bản dịch; còn lại giữ chẩn đoán kỹ thuật của core. */
const ISSUE_KEYS: Partial<Record<CatalogValidationCode, string>> = {
  missing_name: 'catalog.field.nameRequired',
};

function issueText(issue: CatalogIssue): string {
  const key = ISSUE_KEYS[issue.code];
  return key === undefined ? issue.message : t(key);
}

const issues = computed<readonly string[]>(() => {
  const list: string[] = [];

  const hasHalfFilled = entries.value.some(
    (entry) => entry.productId !== '' && entry.price === null,
  );
  if (hasHalfFilled) list.push(t('catalog.price.entryIncomplete'));

  try {
    list.push(...validatePriceList(candidateDoc()).map(issueText));
  } catch (error) {
    // Giá không đổi được thành Money chính xác (ví dụ quá nhiều chữ số thập phân).
    list.push(error instanceof Error ? error.message : String(error));
  }

  return list;
});

/** Bước nhảy của ô giá: 1 với VND, 0.01 với USD. */
const step = computed(() => 1 / minorUnitsPerMajor(currency.value));

const formEl = ref<HTMLFormElement | null>(null);

/** `Button.Root` hardcode `type="button"`, nên nút Lưu tự gọi `requestSubmit()`. */
function requestSubmit(): void {
  formEl.value?.requestSubmit();
}

function onSubmit(): void {
  submitted.value = true;
  const effectiveFrom = fromDatetimeLocal(fromLocal.value);
  if (effectiveFrom === null || issues.value.length > 0) return;

  emit('save', {
    name: localizedName(),
    effectiveFrom,
    effectiveTo: fromDatetimeLocal(toLocal.value),
    priority: priority.value,
    entries: entryPayload(),
  });
}
</script>

<template>
  <section class="price-list-editor">
    <h3>{{ priceList === null ? t('catalog.price.new') : t('catalog.price.edit') }}</h3>

    <p class="price-list-editor__branch">{{ t('catalog.branch') }}: {{ branchId }}</p>

    <form ref="formEl" data-price-form novalidate @submit.prevent="onSubmit">
      <div class="price-list-editor__row">
        <Input.Root v-model="nameVi" data-price-name type="text" :label="t('catalog.field.name')">
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="nameEn"
          data-price-name-en
          type="text"
          :label="t('catalog.field.nameEn')"
        >
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="fromLocal"
          data-price-from
          type="datetime-local"
          :label="t('catalog.price.effectiveFrom')"
        >
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="toLocal"
          data-price-to
          type="datetime-local"
          :label="t('catalog.price.effectiveTo')"
        >
          <Input.Control />
        </Input.Root>

        <NumberField.Root
          data-price-priority
          :label="t('catalog.price.priority')"
          :model-value="priority"
          :locale="activeLocale"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="(value: number | null) => (priority = value ?? 0)"
        >
          <NumberField.Control />
        </NumberField.Root>
      </div>

      <div class="price-list-editor__entries">
        <span>{{ t('catalog.price.entries') }}</span>

        <ul>
          <li
            v-for="(entry, index) in entries"
            :key="index"
            class="price-list-editor__entry"
            data-entry-row
          >
            <div data-entry-product>
              <Select.Root
                :model-value="entry.productId === '' ? null : entry.productId"
                @update:model-value="(value: unknown) => setEntryProduct(index, value)"
              >
                <Select.Activator :label="t('catalog.price.entry.product')">
                  {{ productLabel(entry.productId) }}
                </Select.Activator>
                <Select.Content eager>
                  <Select.Item v-for="product in products" :key="product._id" :value="product._id">
                    {{ product.name[activeLocale] }}
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <div data-entry-variant>
              <Select.Root
                :model-value="entry.variantId"
                @update:model-value="(value: unknown) => setEntryVariant(index, value)"
              >
                <Select.Activator :label="t('catalog.price.entry.variant')">
                  {{ variantLabel(entry) }}
                </Select.Activator>
                <Select.Content eager>
                  <Select.Item :value="ALL_VARIANTS">
                    {{ t('catalog.price.allVariants') }}
                  </Select.Item>
                  <Select.Item
                    v-for="variant in variantsOf(entry.productId)"
                    :key="variant.id"
                    :value="variant.id"
                  >
                    {{ variant.name[activeLocale] }}
                  </Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            <NumberField.Root
              data-entry-price
              :label="t('catalog.price.entry.price')"
              :model-value="entry.price"
              :locale="activeLocale"
              :min="0"
              :step="step"
              commit-on="input"
              @update:model-value="(value: number | null) => updateEntry(index, { price: value })"
            >
              <NumberField.Control />
            </NumberField.Root>

            <Button.Root type="button" data-entry-remove @click="removeEntry(index)">
              {{ t('catalog.price.entry.remove') }}
            </Button.Root>
          </li>
        </ul>

        <Button.Root type="button" data-entry-add @click="addEntry">
          {{ t('catalog.price.entry.add') }}
        </Button.Root>
      </div>

      <ul v-if="submitted && issues.length > 0" class="price-list-editor__issues" role="alert">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>

      <div class="price-list-editor__actions">
        <Button.Root type="button" data-price-save @click="requestSubmit">
          {{ t('common.save') }}
        </Button.Root>

        <Button.Root type="button" data-price-cancel @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button.Root>
      </div>
    </form>
  </section>
</template>
