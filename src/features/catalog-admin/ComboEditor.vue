<script lang="ts">
import type { Money } from '@/core/money';
import type { LocalizedText } from '@/core/types/definition';

export interface ComboOptionFormValue {
  readonly optionId: string;
  readonly productId: string;
  readonly priceDelta: Money;
}

export interface ComboGroupFormValue {
  readonly key: string;
  readonly label: LocalizedText;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly options: readonly ComboOptionFormValue[];
}

/**
 * Giá trị form của một combo — hợp đồng giữa `ComboEditor` và `CatalogAdmin`.
 * Khai ở khối `<script>` thường để export được cho cha dùng.
 */
export interface ComboFormValue {
  readonly name: LocalizedText;
  readonly basePrice: Money;
  readonly categoryId: string | null;
  readonly imageRef: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly comboGroups: readonly ComboGroupFormValue[];
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, NumberField, Select } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import { createEnvelope } from '@/core/db/envelope';
import { comboDocId } from '@/core/db/ids';
import { minorUnitsPerMajor } from '@/core/money';
import type { CurrencyCode } from '@/core/money';
import { parseMoneyInput } from '@/core/money-parse';
import { COMBO_DOC_TYPE, validateCombo } from '@/core/catalog/combo';
import type { ComboDoc } from '@/core/catalog/combo';
import type { ProductDoc } from '@/core/catalog/product';
import type { CatalogIssue, CatalogValidationCode } from '@/core/catalog/validation';

/**
 * Form sửa một combo / set menu (§13.4).
 *
 * `optionId` suy từ món con (`product:pho-bo` → `opt:pho-bo`) chứ không bắt người dùng
 * gõ: bill line tham chiếu lựa chọn bằng id này, nên nó phải ổn định và duy nhất. Chọn
 * cùng một món hai lần trong một combo sẽ trùng id — `validateCombo` của core bắt lỗi đó.
 *
 * Combo **không** lồng combo: ô chọn món con chỉ nhận `products`.
 */

const props = defineProps<{
  /** `null` = tạo combo mới. */
  combo: ComboDoc | null;
  /** Món con có thể chọn — chỉ product, không bao giờ combo khác. */
  products: readonly ProductDoc[];
}>();

const emit = defineEmits<{ save: [value: ComboFormValue]; cancel: [] }>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

/** Tiền tệ của combo: theo chính combo đang sửa; combo mới mặc định VND (§R8). */
const currency = computed<CurrencyCode>(() => props.combo?.basePrice.currency ?? 'VND');

interface OptionDraft {
  productId: string;
  /** Suy từ `productId`; rỗng khi chưa chọn món. */
  optionId: string;
  /** Đơn vị lớn; đổi sang `Money` khi lưu. */
  delta: number | null;
}

interface GroupDraft {
  key: string;
  labelVi: string;
  labelEn: string;
  minSelect: number;
  maxSelect: number;
  options: OptionDraft[];
}

const nameVi = ref('');
const nameEn = ref('');
const price = ref<number | null>(null);
const imageRef = ref('');
const sortOrder = ref(0);
const isActive = ref(true);
const groups = ref<GroupDraft[]>([]);
const submitted = ref(false);

function loadFrom(combo: ComboDoc | null): void {
  nameVi.value = combo?.name.vi ?? '';
  nameEn.value = combo?.name.en ?? '';
  price.value =
    combo === null ? null : combo.basePrice.minor / minorUnitsPerMajor(combo.basePrice.currency);
  imageRef.value = combo?.imageRef ?? '';
  sortOrder.value = combo?.sortOrder ?? 0;
  isActive.value = combo?.isActive ?? true;
  groups.value = (combo?.comboGroups ?? []).map((group) => ({
    key: group.key,
    labelVi: group.label.vi,
    labelEn: group.label.en,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options.map((option) => ({
      productId: option.productId,
      optionId: option.optionId,
      delta: option.priceDelta.minor / minorUnitsPerMajor(option.priceDelta.currency),
    })),
  }));
  submitted.value = false;
}

watch(() => props.combo, loadFrom, { immediate: true });

function localizedName(): LocalizedText {
  const vi = nameVi.value.trim();
  const en = nameEn.value.trim();
  return { vi, en: en === '' ? vi : en };
}

function localizedLabel(group: GroupDraft): LocalizedText {
  const vi = group.labelVi.trim();
  const en = group.labelEn.trim();
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

const priceInvalid = computed(() => price.value !== null && priceMoney.value === null);

/** `optionId` ổn định cho một món con — bill line tham chiếu lựa chọn bằng id này. */
function optionIdFor(productId: string): string {
  const prefix = 'product:';
  const segment = productId.startsWith(prefix) ? productId.slice(prefix.length) : productId;
  return `opt:${segment}`;
}

function groupPayload(): ComboGroupFormValue[] {
  return groups.value.map((group) => ({
    key: group.key.trim(),
    label: localizedLabel(group),
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    options: group.options
      .filter((option) => option.productId !== '')
      .map((option) => ({
        optionId: option.optionId,
        productId: option.productId,
        priceDelta: parseMoneyInput(String(option.delta ?? 0), currency.value),
      })),
  }));
}

/** Ứng viên để core chấm — envelope chỉ để đủ hình dạng, không ghi đi đâu. */
function candidateDoc(basePrice: Money): ComboDoc {
  return {
    ...createEnvelope({
      id: comboDocId('draft'),
      docType: COMBO_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
    }),
    name: localizedName(),
    basePrice,
    comboGroups: groupPayload(),
    categoryId: props.combo?.categoryId ?? null,
    imageRef: trimmedOrNull(imageRef.value),
    sortOrder: sortOrder.value,
    isActive: isActive.value,
  };
}

/** Mã lỗi nào có bản dịch thì hiện bản dịch; còn lại giữ chẩn đoán kỹ thuật của core. */
const ISSUE_KEYS: Partial<Record<CatalogValidationCode, string>> = {
  missing_name: 'catalog.field.nameRequired',
  invalid_price: 'catalog.field.priceInvalid',
};

function issueText(issue: CatalogIssue): string {
  const key = ISSUE_KEYS[issue.code];
  return key === undefined ? issue.message : t(key);
}

const issues = computed<readonly string[]>(() => {
  const list: string[] = [];

  const basePrice = priceMoney.value;
  if (priceInvalid.value) list.push(t('catalog.field.priceInvalid'));
  else if (basePrice === null) list.push(t('type.record.required'));

  if (basePrice !== null) {
    try {
      list.push(...validateCombo(candidateDoc(basePrice)).map(issueText));
    } catch (error) {
      list.push(error instanceof Error ? error.message : String(error));
    }
  }

  return list;
});

function updateGroup(index: number, patch: Partial<GroupDraft>): void {
  groups.value = groups.value.map((group, position) =>
    position === index ? { ...group, ...patch } : group,
  );
}

function updateOption(groupIndex: number, optionIndex: number, patch: Partial<OptionDraft>): void {
  groups.value = groups.value.map((group, position) =>
    position === groupIndex
      ? {
          ...group,
          options: group.options.map((option, optionPosition) =>
            optionPosition === optionIndex ? { ...option, ...patch } : option,
          ),
        }
      : group,
  );
}

function onOptionProduct(groupIndex: number, optionIndex: number, value: unknown): void {
  const productId = typeof value === 'string' ? value : '';
  updateOption(groupIndex, optionIndex, {
    productId,
    optionId: productId === '' ? '' : optionIdFor(productId),
  });
}

function addGroup(): void {
  groups.value = [
    ...groups.value,
    { key: '', labelVi: '', labelEn: '', minSelect: 1, maxSelect: 1, options: [] },
  ];
}

function removeGroup(index: number): void {
  groups.value = groups.value.filter((_, position) => position !== index);
}

function addOption(groupIndex: number): void {
  groups.value = groups.value.map((group, position) =>
    position === groupIndex
      ? { ...group, options: [...group.options, { productId: '', optionId: '', delta: 0 }] }
      : group,
  );
}

function removeOption(groupIndex: number, optionIndex: number): void {
  groups.value = groups.value.map((group, position) =>
    position === groupIndex
      ? { ...group, options: group.options.filter((_, row) => row !== optionIndex) }
      : group,
  );
}

function productLabel(productId: string): string {
  if (productId === '') return '';
  const product = props.products.find((entry) => entry._id === productId);
  return product === undefined ? productId : product.name[activeLocale.value];
}

/** Bước nhảy của ô tiền: 1 với VND, 0.01 với USD. */
const step = computed(() => 1 / minorUnitsPerMajor(currency.value));

const formEl = ref<HTMLFormElement | null>(null);

/** `Button.Root` hardcode `type="button"`, nên nút Lưu tự gọi `requestSubmit()`. */
function requestSubmit(): void {
  formEl.value?.requestSubmit();
}

function onSubmit(): void {
  submitted.value = true;
  const basePrice = priceMoney.value;
  if (basePrice === null || issues.value.length > 0) return;

  emit('save', {
    name: localizedName(),
    basePrice,
    categoryId: props.combo?.categoryId ?? null,
    imageRef: trimmedOrNull(imageRef.value),
    sortOrder: sortOrder.value,
    isActive: isActive.value,
    comboGroups: groupPayload(),
  });
}
</script>

<template>
  <section class="combo-editor">
    <h3>{{ combo === null ? t('catalog.combo.new') : t('catalog.combo.edit') }}</h3>

    <form ref="formEl" data-combo-form novalidate @submit.prevent="onSubmit">
      <div class="combo-editor__row">
        <Input.Root v-model="nameVi" data-combo-name type="text" :label="t('catalog.field.name')">
          <Input.Control />
        </Input.Root>

        <Input.Root
          v-model="nameEn"
          data-combo-name-en
          type="text"
          :label="t('catalog.field.nameEn')"
        >
          <Input.Control />
        </Input.Root>

        <NumberField.Root
          data-combo-price
          :label="t('catalog.field.basePrice')"
          :model-value="price"
          :locale="activeLocale"
          :min="0"
          :step="step"
          commit-on="input"
          @update:model-value="(value: number | null) => (price = value)"
        >
          <NumberField.Control />
        </NumberField.Root>

        <Input.Root
          v-model="imageRef"
          data-combo-image
          type="text"
          :label="t('catalog.field.imageRef')"
        >
          <Input.Control />
        </Input.Root>

        <NumberField.Root
          data-combo-sort-order
          :label="t('catalog.field.sortOrder')"
          :model-value="sortOrder"
          :locale="activeLocale"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="(value: number | null) => (sortOrder = value ?? 0)"
        >
          <NumberField.Control />
        </NumberField.Root>

        <Checkbox.Root
          data-combo-active
          :model-value="isActive"
          @update:model-value="(value: boolean | undefined) => (isActive = value === true)"
        >
          {{ t('catalog.product.active') }}
        </Checkbox.Root>
      </div>

      <div class="combo-editor__groups">
        <span>{{ t('catalog.combo.groups') }}</span>

        <ul>
          <li
            v-for="(group, groupIndex) in groups"
            :key="groupIndex"
            class="combo-editor__group"
            data-combo-group
          >
            <Input.Root
              data-combo-group-key
              type="text"
              :label="t('catalog.combo.group.key')"
              :model-value="group.key"
              @update:model-value="(value: string) => updateGroup(groupIndex, { key: value })"
            >
              <Input.Control />
            </Input.Root>

            <Input.Root
              data-combo-group-label
              type="text"
              :label="t('catalog.combo.group.label')"
              :model-value="group.labelVi"
              @update:model-value="(value: string) => updateGroup(groupIndex, { labelVi: value })"
            >
              <Input.Control />
            </Input.Root>

            <Input.Root
              data-combo-group-label-en
              type="text"
              :label="t('catalog.field.nameEn')"
              :model-value="group.labelEn"
              @update:model-value="(value: string) => updateGroup(groupIndex, { labelEn: value })"
            >
              <Input.Control />
            </Input.Root>

            <NumberField.Root
              data-combo-group-min
              :label="t('catalog.modifier.minSelect')"
              :model-value="group.minSelect"
              :locale="activeLocale"
              :min="0"
              :step="1"
              commit-on="input"
              @update:model-value="(value: number | null) => updateGroup(groupIndex, { minSelect: value ?? 0 })"
            >
              <NumberField.Control />
            </NumberField.Root>

            <NumberField.Root
              data-combo-group-max
              :label="t('catalog.modifier.maxSelect')"
              :model-value="group.maxSelect"
              :locale="activeLocale"
              :min="0"
              :step="1"
              commit-on="input"
              @update:model-value="(value: number | null) => updateGroup(groupIndex, { maxSelect: value ?? 0 })"
            >
              <NumberField.Control />
            </NumberField.Root>

            <Button.Root type="button" data-combo-group-remove @click="removeGroup(groupIndex)">
              {{ t('catalog.combo.group.remove') }}
            </Button.Root>

            <ul>
              <li
                v-for="(option, optionIndex) in group.options"
                :key="optionIndex"
                class="combo-editor__option"
                data-combo-option
              >
                <div data-combo-option-product>
                  <Select.Root
                    :model-value="option.productId === '' ? null : option.productId"
                    @update:model-value="(value: unknown) => onOptionProduct(groupIndex, optionIndex, value)"
                  >
                    <Select.Activator :label="t('catalog.combo.option.product')">
                      {{ productLabel(option.productId) }}
                    </Select.Activator>
                    <Select.Content eager>
                      <Select.Item v-for="product in products" :key="product._id" :value="product._id">
                        {{ product.name[activeLocale] }}
                      </Select.Item>
                    </Select.Content>
                  </Select.Root>
                </div>

                <NumberField.Root
                  data-combo-option-delta
                  :label="t('catalog.combo.option.delta')"
                  :model-value="option.delta"
                  :locale="activeLocale"
                  :step="step"
                  commit-on="input"
                  @update:model-value="(value: number | null) => updateOption(groupIndex, optionIndex, { delta: value })"
                >
                  <NumberField.Control />
                </NumberField.Root>

                <Button.Root
                  type="button"
                  data-combo-option-remove
                  @click="removeOption(groupIndex, optionIndex)"
                >
                  {{ t('catalog.combo.option.remove') }}
                </Button.Root>
              </li>
            </ul>

            <Button.Root type="button" data-combo-option-add @click="addOption(groupIndex)">
              {{ t('catalog.combo.option.add') }}
            </Button.Root>
          </li>
        </ul>

        <Button.Root type="button" data-combo-group-add @click="addGroup">
          {{ t('catalog.combo.group.add') }}
        </Button.Root>
      </div>

      <ul v-if="submitted && issues.length > 0" class="combo-editor__issues" role="alert">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>

      <div class="combo-editor__actions">
        <Button.Root type="button" data-combo-save @click="requestSubmit">
          {{ t('common.save') }}
        </Button.Root>

        <Button.Root type="button" data-combo-cancel @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button.Root>
      </div>
    </form>
  </section>
</template>
