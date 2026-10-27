<script lang="ts">
import type { Money } from '@/core/money';
import type { LocalizedText } from '@/core/types/definition';

/** Một lựa chọn (topping) trong form — cùng hình dạng với `ModifierOption` của core. */
export interface ModifierOptionFormValue {
  readonly id: string;
  readonly name: LocalizedText;
  readonly priceDelta: Money;
  readonly isDefault: boolean;
}

/**
 * Giá trị form của một nhóm modifier — hợp đồng giữa `ModifierGroupEditor` và
 * `CatalogAdmin`. Khai ở khối `<script>` thường để export được cho cha dùng.
 */
export interface ModifierGroupFormValue {
  readonly name: LocalizedText;
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly sortOrder: number;
  readonly options: readonly ModifierOptionFormValue[];
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Input, NumberField } from '@vuetify/v0';
import type { SupportedLocale } from '@/i18n';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import { createEnvelope } from '@/core/db/envelope';
import { modifierGroupDocId } from '@/core/db/ids';
import { minorUnitsPerMajor } from '@/core/money';
import type { CurrencyCode } from '@/core/money';
import { parseMoneyInput } from '@/core/money-parse';
import { MODIFIER_GROUP_DOC_TYPE, validateModifierGroup } from '@/core/catalog/modifier-group';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { CatalogIssue, CatalogValidationCode } from '@/core/catalog/validation';

/**
 * Form sửa một nhóm modifier (topping) — tầng global.
 *
 * Lỗi hiển thị lấy thẳng từ `validateModifierGroup` của core: cùng nguồn chân lý với
 * repository, nên UI không bao giờ báo "hợp lệ" cho thứ mà lúc ghi sẽ bị từ chối.
 */

const props = defineProps<{
  /** `null` = tạo nhóm mới. */
  group: ModifierGroupDoc | null;
}>();

const emit = defineEmits<{ save: [value: ModifierGroupFormValue]; cancel: [] }>();

const { t, locale } = useI18n();

const activeLocale = computed<SupportedLocale>(() => (locale.value === 'en' ? 'en' : 'vi'));

/** Tiền tệ của nhóm: theo lựa chọn đang có; nhóm mới mặc định VND (§R8 — quán Việt). */
const currency = computed<CurrencyCode>(() => props.group?.options[0]?.priceDelta.currency ?? 'VND');

interface OptionDraft {
  id: string;
  nameVi: string;
  nameEn: string;
  /** Đơn vị lớn (đúng thứ ô nhập hiển thị); đổi sang `Money` khi lưu. */
  delta: number | null;
  isDefault: boolean;
}

const nameVi = ref('');
const nameEn = ref('');
const minSelect = ref(0);
const maxSelect = ref(1);
const sortOrder = ref(0);
const options = ref<OptionDraft[]>([]);
const submitted = ref(false);

function loadFrom(group: ModifierGroupDoc | null): void {
  nameVi.value = group?.name.vi ?? '';
  nameEn.value = group?.name.en ?? '';
  minSelect.value = group?.minSelect ?? 0;
  maxSelect.value = group?.maxSelect ?? 1;
  sortOrder.value = group?.sortOrder ?? 0;
  options.value = (group?.options ?? []).map((option) => ({
    id: option.id,
    nameVi: option.name.vi,
    nameEn: option.name.en,
    delta: option.priceDelta.minor / minorUnitsPerMajor(option.priceDelta.currency),
    isDefault: option.isDefault === true,
  }));
  submitted.value = false;
}

watch(() => props.group, loadFrom, { immediate: true });

function localizedName(): LocalizedText {
  const vi = nameVi.value.trim();
  const en = nameEn.value.trim();
  return { vi, en: en === '' ? vi : en };
}

/** Dòng chưa có mã coi như chưa điền — không đẩy vào core để tránh lỗi nhiễu. */
function optionPayload(): ModifierOptionFormValue[] {
  return options.value
    .filter((row) => row.id.trim() !== '')
    .map((row) => {
      const vi = row.nameVi.trim();
      const en = row.nameEn.trim();
      return {
        id: row.id.trim(),
        name: { vi, en: en === '' ? vi : en },
        priceDelta: parseMoneyInput(String(row.delta ?? 0), currency.value),
        isDefault: row.isDefault,
      };
    });
}

/** Ứng viên để core chấm — envelope chỉ để đủ hình dạng, không ghi đi đâu. */
function candidateDoc(): ModifierGroupDoc {
  return {
    ...createEnvelope({
      id: modifierGroupDocId('draft'),
      docType: MODIFIER_GROUP_DOC_TYPE,
      branchId: GLOBAL_BRANCH_ID,
    }),
    name: localizedName(),
    minSelect: minSelect.value,
    maxSelect: maxSelect.value,
    options: optionPayload(),
    sortOrder: sortOrder.value,
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
  try {
    return validateModifierGroup(candidateDoc()).map(issueText);
  } catch (error) {
    // Delta của lựa chọn không đổi được thành Money chính xác.
    return [error instanceof Error ? error.message : String(error)];
  }
});

function onNumeric(target: 'min' | 'max' | 'sortOrder', value: number | null): void {
  const next = value ?? 0;
  if (target === 'min') minSelect.value = next;
  else if (target === 'max') maxSelect.value = next;
  else sortOrder.value = next;
}

function onOptionNumeric(index: number, value: number | null): void {
  options.value = options.value.map((row, position) =>
    position === index ? { ...row, delta: value } : row,
  );
}

function onOptionText(index: number, field: 'id' | 'nameVi' | 'nameEn', value: string): void {
  options.value = options.value.map((row, position) =>
    position === index ? { ...row, [field]: value } : row,
  );
}

function onOptionDefault(index: number, value: boolean | undefined): void {
  options.value = options.value.map((row, position) =>
    position === index ? { ...row, isDefault: value === true } : row,
  );
}

function addOption(): void {
  options.value = [...options.value, { id: '', nameVi: '', nameEn: '', delta: 0, isDefault: false }];
}

function removeOption(index: number): void {
  options.value = options.value.filter((_, position) => position !== index);
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
  if (issues.value.length > 0) return;

  emit('save', {
    name: localizedName(),
    minSelect: minSelect.value,
    maxSelect: maxSelect.value,
    sortOrder: sortOrder.value,
    options: optionPayload(),
  });
}
</script>

<template>
  <section class="grid gap-4">
    <h3 class="text-lg font-semibold">{{ group === null ? t('catalog.modifier.new') : t('catalog.modifier.edit') }}</h3>

    <form ref="formEl" class="form-grid" data-group-form novalidate @submit.prevent="onSubmit">
      <div class="flex flex-wrap gap-2">
        <Input.Root v-model="nameVi" data-group-name type="text" :label="t('catalog.field.name')">
          <Input.Control class="field-input" :placeholder="t('catalog.field.name')" />
        </Input.Root>

        <Input.Root
          v-model="nameEn"
          data-group-name-en
          type="text"
          :label="t('catalog.field.nameEn')"
        >
          <Input.Control class="field-input" :placeholder="t('catalog.field.nameEn')" />
        </Input.Root>

        <NumberField.Root
          data-group-min
          :label="t('catalog.modifier.minSelect')"
          :model-value="minSelect"
          :locale="activeLocale"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="(value: number | null) => onNumeric('min', value)"
        >
          <NumberField.Control class="field-input" :placeholder="t('catalog.modifier.minSelect')" />
        </NumberField.Root>

        <NumberField.Root
          data-group-max
          :label="t('catalog.modifier.maxSelect')"
          :model-value="maxSelect"
          :locale="activeLocale"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="(value: number | null) => onNumeric('max', value)"
        >
          <NumberField.Control class="field-input" :placeholder="t('catalog.modifier.maxSelect')" />
        </NumberField.Root>

        <NumberField.Root
          data-group-sort-order
          :label="t('catalog.field.sortOrder')"
          :model-value="sortOrder"
          :locale="activeLocale"
          :min="0"
          :step="1"
          commit-on="input"
          @update:model-value="(value: number | null) => onNumeric('sortOrder', value)"
        >
          <NumberField.Control class="field-input" :placeholder="t('catalog.field.sortOrder')" />
        </NumberField.Root>
      </div>

      <div class="mt-4 grid gap-2">
        <span class="text-sm font-medium text-text">{{ t('catalog.modifier.options') }}</span>

        <ul class="grid gap-2">
          <li
            v-for="(row, index) in options"
            :key="index"
            class="grid gap-2 rounded-md border border-solid border-text/15 p-3"
            data-option-row
          >
            <Input.Root
              data-option-id
              type="text"
              :label="t('catalog.modifier.option.id')"
              :model-value="row.id"
              @update:model-value="(value: string) => onOptionText(index, 'id', value)"
            >
              <Input.Control class="field-input" :placeholder="t('catalog.modifier.option.id')" />
            </Input.Root>

            <Input.Root
              data-option-name
              type="text"
              :label="t('catalog.field.name')"
              :model-value="row.nameVi"
              @update:model-value="(value: string) => onOptionText(index, 'nameVi', value)"
            >
              <Input.Control class="field-input" :placeholder="t('catalog.field.name')" />
            </Input.Root>

            <Input.Root
              data-option-name-en
              type="text"
              :label="t('catalog.field.nameEn')"
              :model-value="row.nameEn"
              @update:model-value="(value: string) => onOptionText(index, 'nameEn', value)"
            >
              <Input.Control class="field-input" :placeholder="t('catalog.field.nameEn')" />
            </Input.Root>

            <NumberField.Root
              data-option-delta
              :label="t('catalog.modifier.option.delta')"
              :model-value="row.delta"
              :locale="activeLocale"
              :step="step"
              commit-on="input"
              @update:model-value="(value: number | null) => onOptionNumeric(index, value)"
            >
              <NumberField.Control class="field-input" :placeholder="t('catalog.modifier.option.delta')" />
            </NumberField.Root>

            <Checkbox.Root
              data-option-default
              class="inline-flex cursor-pointer items-center gap-2 text-sm text-text"
              :model-value="row.isDefault"
              @update:model-value="(value: boolean | undefined) => onOptionDefault(index, value)"
            >
              {{ t('catalog.modifier.option.default') }}
            </Checkbox.Root>

            <Button.Root type="button" class="btn-danger" data-option-remove @click="removeOption(index)">
              {{ t('catalog.modifier.option.remove') }}
            </Button.Root>
          </li>
        </ul>

        <Button.Root type="button" class="btn-primary" data-option-add @click="addOption">
          {{ t('catalog.modifier.option.add') }}
        </Button.Root>
      </div>

      <ul v-if="submitted && issues.length > 0" class="error-text grid gap-1" role="alert">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>

      <div class="flex justify-end gap-2">
        <Button.Root type="button" class="btn-primary" data-group-save @click="requestSubmit">
          {{ t('common.save') }}
        </Button.Root>

        <Button.Root type="button" class="btn-ghost" data-group-cancel @click="emit('cancel')">
          {{ t('common.cancel') }}
        </Button.Root>
      </div>
    </form>
  </section>
</template>
