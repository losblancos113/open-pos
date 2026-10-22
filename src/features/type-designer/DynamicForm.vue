<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { buildFormModel } from '@/core/types/read-model';
import type { FormFieldModel } from '@/core/types/read-model';
import { fieldType, formatFieldValue } from '@/core/types/field-registry';
import type { ValidationCode } from '@/core/types/field-registry';
import type { FieldDefinition, TypeDefinition } from '@/core/types/definition';
import type { SupportedLocale } from '@/i18n';
import FieldWidgets from './FieldWidgets.vue';

const props = withDefaults(
  defineProps<{
    definition: TypeDefinition;
    modelValue: Record<string, unknown>;
    locale?: SupportedLocale;
  }>(),
  { locale: 'vi' },
);

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
  submit: [value: Record<string, unknown>];
}>();

const { t } = useI18n();

/** Lỗi chỉ hiện sau lần submit đầu tiên — không doạ người dùng ngay khi mở form. */
const submitted = ref(false);

/** Mọi logic suy giá trị nằm ở Task 11; SFC chỉ render. */
const form = computed(() => buildFormModel(props.definition, props.modelValue));

/**
 * Mã lỗi chỉ dùng để tra bản dịch. `ValidationIssue.message` của registry là chẩn đoán
 * kỹ thuật (tiếng Anh, theo quy ước CLAUDE.md) nên chỉ hiện khi chưa có bản dịch.
 */
const RECORD_ERROR_KEYS: Partial<Record<ValidationCode, string>> = {
  required: 'type.record.required',
};

function displayMessage(entry: FormFieldModel): string | null {
  if (entry.error === null) return null;
  // Lỗi field tính toán là "không tính được" — không có mã lỗi người dùng, giữ nguyên.
  if (entry.computed) return entry.error;

  const code = fieldType(entry.field.dataType).validate(entry.value, entry.field)[0]?.code ?? null;
  const key = code === null ? undefined : RECORD_ERROR_KEYS[code];
  return key === undefined ? entry.error : t(key);
}

/**
 * Chỉ lỗi của field người dùng nhập được mới chặn submit. Field tính toán không nhập
 * được nên lỗi của nó là thông tin, không phải rào cản — nếu không, một field tuỳ chọn
 * để trống sẽ khoá luôn cả form khi có formula phụ thuộc nó.
 */
const hasErrors = computed(() =>
  form.value.fields.some((entry) => !entry.computed && entry.error !== null),
);

interface FieldView {
  readonly key: string;
  readonly field: FieldDefinition;
  readonly computed: boolean;
  readonly value: unknown;
  /** Chỉ có giá trị với field `formula`; `null` với field nhập được. */
  readonly text: string | null;
  readonly error: string | null;
}

const fields = computed<FieldView[]>(() =>
  form.value.fields.map((entry) => ({
    key: entry.field.key,
    field: entry.field,
    computed: entry.computed,
    value: entry.value,
    text: entry.computed ? formatFieldValue(entry.value, entry.field, props.locale) : null,
    error: submitted.value ? displayMessage(entry) : null,
  })),
);

/** Record để lưu: giá trị hiệu dụng của mọi field nhập được. Field tính toán không lưu. */
const storedValues = computed<Record<string, unknown>>(() => {
  const result: Record<string, unknown> = { ...props.modelValue };
  for (const entry of form.value.fields) {
    if (entry.computed) continue;
    result[entry.field.key] = entry.value;
  }
  return result;
});

function onFieldInput(key: string, value: unknown) {
  emit('update:modelValue', { ...storedValues.value, [key]: value });
}

function onSubmit() {
  submitted.value = true;
  if (hasErrors.value) return;
  emit('submit', storedValues.value);
}
</script>

<template>
  <form class="dynamic-form" novalidate @submit.prevent="onSubmit">
    <div
      v-for="field in fields"
      :key="field.key"
      class="dynamic-form__field"
      :data-field="field.key"
      :data-computed="field.computed ? 'true' : undefined"
    >
      <template v-if="field.computed">
        <span class="dynamic-form__label">{{ field.field.label[locale] }}</span>
        <output class="dynamic-form__computed">{{ field.text }}</output>
      </template>

      <FieldWidgets
        v-else
        :field="field.field"
        :model-value="field.value"
        :locale="locale"
        @update:model-value="(value: unknown) => onFieldInput(field.key, value)"
      />

      <p v-if="field.error" class="dynamic-form__error" role="alert">{{ field.error }}</p>
    </div>
  </form>
</template>
