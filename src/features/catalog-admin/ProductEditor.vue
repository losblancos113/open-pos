<script lang="ts">
import type { Money } from '@/core/money';
import type { ProductVariant } from '@/core/catalog/product';
import type { LocalizedText } from '@/core/types/definition';

/**
 * Giá trị form của một món — hợp đồng giữa `ProductEditor` và `CatalogAdmin`.
 *
 * Khai ở khối `<script>` thường (không phải `<script setup>`) để export được cho cha
 * dùng, thay vì mỗi bên tự mô tả lại hình dạng này.
 */
export interface ProductFormValue {
  readonly name: LocalizedText;
  readonly categoryId: string | null;
  readonly basePrice: Money;
  readonly unit: string | null;
  readonly variants: readonly ProductVariant[];
  readonly modifierGroupIds: readonly string[];
  readonly barcode: string | null;
  readonly imageRef: string | null;
  readonly sku: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly customFields: Readonly<Record<string, unknown>>;
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, NumberField, Select } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import { createEnvelope } from '@/core/db/envelope';
import { productDocId } from '@/core/db/ids';
import { minorUnitsPerMajor } from '@/core/money';
import type { CurrencyCode } from '@/core/money';
import { parseMoneyInput } from '@/core/money-parse';
import type { CategoryDoc } from '@/core/catalog/category';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import { PRODUCT_DOC_TYPE, validateProduct } from '@/core/catalog/product';
import type { ProductDoc, ProductRecord } from '@/core/catalog/product';
import type { CatalogIssue, CatalogValidationCode } from '@/core/catalog/validation';
import { pickCustomValues } from '@/core/types/custom-fields';
import type { TypeDefinition } from '@/core/types/definition';
import { fieldType, formatFieldValue } from '@/core/types/field-registry';
import { buildFormModel } from '@/core/types/read-model';
import type { FormFieldModel } from '@/core/types/read-model';
import FieldWidgets from '@/features/type-designer/FieldWidgets.vue';

/**
 * Form sửa một món: field hệ thống của catalog + field tuỳ chỉnh của type `product` (M1).
 *
 * Field tuỳ chỉnh dùng **cùng engine của M1** (`buildFormModel` + `FieldWidgets`): cùng
 * validator của field registry, cùng widget, cùng cách dịch mã lỗi `required`. Không dùng
 * component `DynamicForm` vì nó tự render `<form>` và nút Lưu riêng — sản phẩm chỉ có
 * **một** form và **một** nút Lưu, nên hai form lồng nhau sẽ tạo hai đường lưu khác nhau.
 *
 * Mọi giá trị tiền đi qua `parseMoneyInput` (chuỗi → `Money` nguyên), không nhân/chia
 * float: ô nhập của Vuetify0 làm việc theo đơn vị lớn, còn `Money` theo đơn vị nhỏ.
 */

const props = defineProps<{
  /** `null` = tạo món mới. */
  product: ProductRecord | null;
  categories: readonly CategoryDoc[];
  modifierGroups: readonly ModifierGroupDoc[];
  /** Type `product` của M1; `null` khi chưa khai báo — khi đó không có field tuỳ chỉnh. */
  productType: TypeDefinition | null;
}>();

const emit = defineEmits<{ save: [value: ProductFormValue]; cancel: [] }>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

/** Tiền tệ của món: theo chính món đang sửa; món mới mặc định VND (§R8 — quán Việt). */
const currency = computed<CurrencyCode>(() => props.product?.basePrice.currency ?? 'VND');
const minorPerMajor = computed(() => minorUnitsPerMajor(currency.value));

/** `Select` coi giá trị rỗng là "chưa chọn", nên "không có danh mục" cần một sentinel. */
const NO_CATEGORY = '__none__';

interface VariantDraft {
  id: string;
  nameVi: string;
  nameEn: string;
  /** Đơn vị lớn (đúng thứ ô nhập hiển thị); đổi sang `Money` khi lưu. */
  delta: number | null;
}

interface DraftIssue {
  readonly path: string;
  readonly message: string;
}

const nameVi = ref('');
const nameEn = ref('');
const price = ref<number | null>(null);
const unit = ref('');
const barcode = ref('');
const sku = ref('');
const imageRef = ref('');
const categoryId = ref('');
const sortOrder = ref(0);
const isActive = ref(true);
const modifierGroupIds = ref<string[]>([]);
const variants = ref<VariantDraft[]>([]);
const customValues = ref<Record<string, unknown>>({});
const submitted = ref(false);

function majorOf(value: Money): number {
  return value.minor / minorUnitsPerMajor(value.currency);
}

function loadFrom(product: ProductRecord | null): void {
  nameVi.value = product?.name.vi ?? '';
  nameEn.value = product?.name.en ?? '';
  price.value = product === null ? null : majorOf(product.basePrice);
  unit.value = product?.unit ?? '';
  barcode.value = product?.barcode ?? '';
  sku.value = product?.sku ?? '';
  imageRef.value = product?.imageRef ?? '';
  categoryId.value = product?.categoryId ?? '';
  sortOrder.value = product?.sortOrder ?? 0;
  isActive.value = product?.isActive ?? true;
  modifierGroupIds.value = [...(product?.modifierGroupIds ?? [])];
  variants.value = (product?.variants ?? []).map((variant) => ({
    id: variant.id,
    nameVi: variant.name.vi,
    nameEn: variant.name.en,
    delta: majorOf(variant.priceDelta),
  }));

  const source: Readonly<Record<string, unknown>> = product ?? {};
  customValues.value = pickCustomValues(props.productType, source);
  submitted.value = false;
}

watch(() => props.product, loadFrom, { immediate: true });

/**
 * Tên để lưu. Ô tiếng Anh bỏ trống thì lấy tên tiếng Việt: `validateLocalizedName` đòi
 * cả hai có nội dung, và menu Việt gần như luôn dùng chung một tên cho hai locale.
 */
function localizedName(): LocalizedText {
  const vi = nameVi.value.trim();
  const en = nameEn.value.trim();
  return { vi, en: en === '' ? vi : en };
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Giá đã nhập, hoặc `null` khi chưa nhập/không đổi được thành `Money` chính xác. */
const priceMoney = computed<Money | null>(() => {
  const value = price.value;
  if (value === null) return null;
  try {
    return parseMoneyInput(String(value), currency.value);
  } catch {
    return null;
  }
});

/** Gõ giá mà `parseMoneyInput` từ chối (ví dụ "12.345" cho USD) — lỗi, không phải "chưa nhập". */
const priceInvalid = computed(() => price.value !== null && priceMoney.value === null);

/** Kích cỡ: bỏ dòng chưa điền mã, còn lại đổi delta sang `Money` chính xác. */
function variantPayload(): readonly ProductVariant[] {
  return variants.value
    .filter((row) => row.id.trim() !== '')
    .map((row) => {
      const vi = row.nameVi.trim();
      const en = row.nameEn.trim();
      return {
        id: row.id.trim(),
        name: { vi, en: en === '' ? vi : en },
        priceDelta: parseMoneyInput(String(row.delta ?? 0), currency.value),
      };
    });
}

/**
 * Ứng viên để `validateProduct` của core chấm. Dựng envelope thật (không ghi đi đâu) để
 * hình dạng khớp document sắp lưu; `id` chỉ cần hợp lệ vì validator không đọc `_id`.
 */
function candidateDoc(basePrice: Money): ProductDoc {
  return {
    ...createEnvelope({
      id: productDocId('draft'),
      docType: PRODUCT_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
    }),
    name: localizedName(),
    categoryId: categoryId.value === '' ? null : categoryId.value,
    basePrice,
    unit: trimmedOrNull(unit.value),
    variants: variantPayload(),
    modifierGroupIds: [...modifierGroupIds.value],
    barcode: trimmedOrNull(barcode.value),
    imageRef: trimmedOrNull(imageRef.value),
    sku: trimmedOrNull(sku.value),
    sortOrder: sortOrder.value,
    isActive: isActive.value,
  };
}

/** Mã lỗi nào có bản dịch thì hiện bản dịch; còn lại giữ chẩn đoán kỹ thuật của core. */
const ISSUE_KEYS: Partial<Record<CatalogValidationCode, string>> = {
  missing_name: 'catalog.product.nameRequired',
  invalid_price: 'catalog.field.priceInvalid',
};

function issueText(issue: CatalogIssue): string {
  const key = ISSUE_KEYS[issue.code];
  return key === undefined ? issue.message : t(key);
}

const priceIssue = computed<DraftIssue | null>(() => {
  if (priceInvalid.value) return { path: 'basePrice', message: t('catalog.field.priceInvalid') };
  if (priceMoney.value === null) return { path: 'basePrice', message: t('type.record.required') };
  return null;
});

const coreIssues = computed<readonly DraftIssue[]>(() => {
  const basePrice = priceMoney.value;
  if (basePrice === null) return [];

  try {
    return validateProduct(candidateDoc(basePrice)).map((issue) => ({
      path: issue.path,
      message: issueText(issue),
    }));
  } catch (error) {
    // Delta của kích cỡ không đổi được thành Money chính xác (ví dụ quá nhiều chữ số thập phân).
    return [
      { path: 'variants', message: error instanceof Error ? error.message : String(error) },
    ];
  }
});

const issues = computed<readonly DraftIssue[]>(() => {
  const priceProblem = priceIssue.value;
  return [...(priceProblem === null ? [] : [priceProblem]), ...coreIssues.value];
});

/** Field tuỳ chỉnh qua engine của M1 — giá trị, widget và lỗi đều do M1 suy ra. */
const customFields = computed<readonly FormFieldModel[]>(() => {
  const definition = props.productType;
  if (definition === null || definition.fields.length === 0) return [];
  return buildFormModel(definition, customValues.value).fields;
});

/**
 * Cùng luật với `DynamicForm`: field tính toán không nhập được nên lỗi của nó là thông
 * tin, không phải rào cản — nếu không, một formula thiếu dữ liệu sẽ khoá cả form.
 */
const customHasErrors = computed(() =>
  customFields.value.some((entry) => !entry.computed && entry.error !== null),
);

function customErrorText(entry: FormFieldModel): string {
  if (entry.computed) return entry.error ?? '';
  const code = fieldType(entry.field.dataType).validate(entry.value, entry.field)[0]?.code ?? null;
  return code === 'required' ? t('type.record.required') : (entry.error ?? '');
}

function onCustomInput(key: string, value: unknown): void {
  customValues.value = { ...customValues.value, [key]: value };
}

/** Giá trị tuỳ chỉnh để lưu: giá trị hiệu dụng của mọi field nhập được (field tính toán bỏ). */
function customPayload(): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = { ...customValues.value };
  for (const entry of customFields.value) {
    if (entry.computed) continue;
    result[entry.field.key] = entry.value;
  }
  return result;
}

const categoryOptions = computed(() => [
  { value: NO_CATEGORY, label: t('catalog.product.uncategorised') },
  ...props.categories.map((category) => ({
    value: category._id,
    label: category.name[activeLocale.value],
  })),
]);

const selectedCategoryLabel = computed(
  () =>
    categoryOptions.value.find((option) => option.value === (categoryId.value === '' ? NO_CATEGORY : categoryId.value))
      ?.label ?? '',
);

const categoryModel = computed(() => (categoryId.value === '' ? NO_CATEGORY : categoryId.value));

function onCategoryInput(value: unknown): void {
  categoryId.value = typeof value === 'string' && value !== NO_CATEGORY ? value : '';
}

const modifierSelection = computed<string[]>(() => [...modifierGroupIds.value]);

function onModifierInput(value: unknown): void {
  modifierGroupIds.value = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function onPriceInput(value: number | null): void {
  price.value = value;
}

function onSortOrder(value: number | null): void {
  sortOrder.value = value ?? 0;
}

function onDeltaInput(index: number, value: number | null): void {
  variants.value = variants.value.map((row, position) =>
    position === index ? { ...row, delta: value } : row,
  );
}

function onVariantText(index: number, field: 'id' | 'nameVi' | 'nameEn', value: string): void {
  variants.value = variants.value.map((row, position) =>
    position === index ? { ...row, [field]: value } : row,
  );
}

function addVariant(): void {
  variants.value = [...variants.value, { id: '', nameVi: '', nameEn: '', delta: 0 }];
}

function removeVariant(index: number): void {
  variants.value = variants.value.filter((_, position) => position !== index);
}

/** Bước nhảy của ô giá/delta: 1 với VND, 0.01 với USD. */
const step = computed(() => 1 / minorPerMajor.value);

const formEl = ref<HTMLFormElement | null>(null);

/** `Button.Root` hardcode `type="button"`, nên nút Lưu tự gọi `requestSubmit()`. */
function requestSubmit(): void {
  formEl.value?.requestSubmit();
}

function onSubmit(): void {
  submitted.value = true;
  const basePrice = priceMoney.value;
  if (basePrice === null || issues.value.length > 0 || customHasErrors.value) return;

  emit('save', {
    name: localizedName(),
    categoryId: categoryId.value === '' ? null : categoryId.value,
    basePrice,
    unit: trimmedOrNull(unit.value),
    variants: variantPayload(),
    modifierGroupIds: [...modifierGroupIds.value],
    barcode: trimmedOrNull(barcode.value),
    imageRef: trimmedOrNull(imageRef.value),
    sku: trimmedOrNull(sku.value),
    sortOrder: sortOrder.value,
    isActive: isActive.value,
    customFields: customPayload(),
  });
}
</script>

<template>
  <section class="product-editor">
    <h3>{{ product === null ? t('catalog.product.new') : t('catalog.product.edit') }}</h3>

    <form ref="formEl" data-product-form novalidate @submit.prevent="onSubmit">
      <div class="product-editor__row">
        <Input.Root v-model="nameVi" data-product-name type="text" :label="t('catalog.field.name')">
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="nameEn"
          data-product-name-en
          type="text"
          :label="t('catalog.field.nameEn')"
        >
          <Input.Control />
        </Input.Root>
      </div>

      <div class="product-editor__row">
        <NumberField.Root
          data-product-price
          :label="t('catalog.field.basePrice')"
          :model-value="price"
          :locale="activeLocale"
          :min="0"
          :step="step"
          commit-on="input"
          @update:model-value="onPriceInput"
        >
          <NumberField.Control />
        </NumberField.Root>

        <Select.Root
          data-product-category
          :model-value="categoryModel"
          @update:model-value="onCategoryInput"
        >
          <Select.Activator :label="t('catalog.field.category')">
            {{ selectedCategoryLabel }}
          </Select.Activator>
          <Select.Content eager>
            <Select.Item v-for="option in categoryOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </Select.Item>
          </Select.Content>
        </Select.Root>

        <Input.Root v-model="unit" data-product-unit type="text" :label="t('catalog.field.unit')">
          <Input.Control />
        </Input.Root>
      </div>

      <div class="product-editor__row">
        <Input.Root
          v-model="barcode"
          data-product-barcode
          type="text"
          :label="t('catalog.field.barcode')"
        >
          <Input.Control />
        </Input.Root>

        <Input.Root v-model="sku" data-product-sku type="text" :label="t('catalog.field.sku')">
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="imageRef"
          data-product-image
          type="text"
          :label="t('catalog.field.imageRef')"
        >
          <Input.Control />
        </Input.Root>

        <NumberField.Root
          data-product-sort-order
          :label="t('catalog.field.sortOrder')"
          :model-value="sortOrder"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="onSortOrder"
        >
          <NumberField.Control />
        </NumberField.Root>

        <Checkbox.Root
          data-product-active
          :model-value="isActive"
          @update:model-value="(value: boolean | undefined) => (isActive = value === true)"
        >
          {{ t('catalog.product.active') }}
        </Checkbox.Root>
      </div>

      <div class="product-editor__modifiers" data-product-modifiers>
        <span>{{ t('catalog.field.modifierGroups') }}</span>

        <p v-if="modifierGroups.length === 0">{{ t('catalog.product.empty') }}</p>
        <Checkbox.Group
          v-else
          :label="t('catalog.field.modifierGroups')"
          :model-value="modifierSelection"
          @update:model-value="onModifierInput"
        >
          <Checkbox.Root v-for="group in modifierGroups" :key="group._id" :value="group._id">
            {{ group.name[activeLocale] }}
          </Checkbox.Root>
        </Checkbox.Group>
      </div>

      <div class="product-editor__variants">
        <span>{{ t('catalog.field.variants') }}</span>

        <p v-if="variants.length === 0">{{ t('catalog.variant.empty') }}</p>

        <ul class="product-editor__variant-list">
          <li
            v-for="(row, index) in variants"
            :key="index"
            class="product-editor__variant"
            data-variant-row
          >
            <Input.Root
              data-variant-id
              type="text"
              :label="t('catalog.variant.id')"
              :model-value="row.id"
              @update:model-value="(value: string) => onVariantText(index, 'id', value)"
            >
              <Input.Control />
            </Input.Root>

            <Input.Root
              data-variant-name
              type="text"
              :label="t('catalog.field.name')"
              :model-value="row.nameVi"
              @update:model-value="(value: string) => onVariantText(index, 'nameVi', value)"
            >
              <Input.Control />
            </Input.Root>

            <Input.Root
              data-variant-name-en
              type="text"
              :label="t('catalog.field.nameEn')"
              :model-value="row.nameEn"
              @update:model-value="(value: string) => onVariantText(index, 'nameEn', value)"
            >
              <Input.Control />
            </Input.Root>

            <NumberField.Root
              data-variant-delta
              :label="t('catalog.variant.delta')"
              :model-value="row.delta"
              :locale="activeLocale"
              :step="step"
              commit-on="input"
              @update:model-value="(value: number | null) => onDeltaInput(index, value)"
            >
              <NumberField.Control />
            </NumberField.Root>

            <Button.Root
              type="button"
              data-variant-remove
              @click="removeVariant(index)"
            >
              {{ t('catalog.variant.remove') }}
            </Button.Root>
          </li>
        </ul>

        <Button.Root type="button" data-variant-add @click="addVariant">
          {{ t('catalog.variant.add') }}
        </Button.Root>
      </div>

      <div v-if="customFields.length > 0" class="product-editor__custom">
        <h4>{{ t('catalog.field.customFields') }}</h4>

        <div
          v-for="entry in customFields"
          :key="entry.field.key"
          class="product-editor__custom-field"
          :data-field="entry.field.key"
          :data-computed="entry.computed ? 'true' : undefined"
        >
          <template v-if="entry.computed">
            <span>{{ entry.field.label[activeLocale] }}</span>
            <output>{{ formatFieldValue(entry.value, entry.field, activeLocale) }}</output>
          </template>

          <FieldWidgets
            v-else
            :field="entry.field"
            :model-value="entry.value"
            :locale="activeLocale"
            @update:model-value="(value: unknown) => onCustomInput(entry.field.key, value)"
          />

          <p v-if="submitted && entry.error !== null" class="product-editor__error" role="alert">
            {{ customErrorText(entry) }}
          </p>
        </div>
      </div>

      <ul v-if="submitted && issues.length > 0" class="product-editor__issues" role="alert">
        <li v-for="issue in issues" :key="`${issue.path}:${issue.message}`">{{ issue.message }}</li>
      </ul>

      <div class="product-editor__actions">
        <Button.Root type="button" data-product-save @click="requestSubmit">
          {{ t('common.save') }}
        </Button.Root>

        <Button.Root type="button" data-product-cancel @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button.Root>
      </div>
    </form>
  </section>
</template>
