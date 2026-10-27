<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Input, NumberField, Select } from '@vuetify/v0';
import { minorUnitsPerMajor, money } from '@/core/money';
import type { CurrencyCode } from '@/core/money';
import { formatFieldValue } from '@/core/types/field-registry';
import type { DataType, FieldDefinition, FieldOption } from '@/core/types/definition';
import type { SupportedLocale } from '@/i18n';

const props = withDefaults(
  defineProps<{
    field: FieldDefinition;
    modelValue: unknown;
    locale?: SupportedLocale;
    currency?: CurrencyCode;
  }>(),
  { locale: 'vi', currency: 'VND' },
);

const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>();

const { t } = useI18n();

const label = computed(() => props.field.label[props.locale]);
const typeLabel = computed(() => t(`type.dataType.${props.field.dataType}`));
const options = computed<readonly FieldOption[]>(() => props.field.options ?? []);
const fieldId = computed(() => `field-${props.field.key}`);

/** Số chữ số thập phân của field `decimal` (D1) — mặc định 2. */
const decimalScale = computed(() => props.field.scale ?? 2);

/** Đơn vị nhỏ nhất của một đơn vị tiền tệ: VND → 1, USD → 100. */
const currency = computed<CurrencyCode>(() => {
  const raw = props.modelValue;
  if (props.field.dataType === 'money' && typeof raw === 'object' && raw !== null) {
    const candidate = (raw as { currency?: unknown }).currency;
    if (candidate === 'VND' || candidate === 'USD') return candidate;
  }
  return props.currency;
});

const minorPerMajor = computed(() => minorUnitsPerMajor(currency.value));

/** Input type của các field dùng `Input.Root`; `textarea` xử lý riêng. */
const inputType = computed(() => {
  const map: Partial<Record<DataType, string>> = {
    text: 'text',
    reference: 'text',
    image: 'text',
    date: 'date',
    datetime: 'datetime-local',
    color: 'color',
  };
  return map[props.field.dataType] ?? 'text';
});

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** ISO (UTC) → giá trị mà `<input type="datetime-local">` hiểu được (giờ địa phương). */
function toDatetimeLocal(value: unknown): string {
  const raw = asString(value);
  if (raw === '') return '';
  const date = new Date(raw);
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

/** Field text-like: rỗng nghĩa là "không có giá trị", nên phát `null` chứ không phát `''`. */
const textValue = computed(() =>
  props.field.dataType === 'datetime' ? toDatetimeLocal(props.modelValue) : asString(props.modelValue),
);

function onTextInput(value: string) {
  emit('update:modelValue', props.field.dataType === 'datetime' ? fromDatetimeLocal(value) : value === '' ? null : value);
}

/** Số mà `NumberField.Root` hiển thị: `decimal` và `money` lưu dạng số nguyên đã scale. */
const numericValue = computed<number | null>(() => {
  const raw = props.modelValue;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (props.field.dataType === 'decimal') return raw / 10 ** decimalScale.value;
  if (props.field.dataType === 'money') return raw / minorPerMajor.value;
  return raw;
});

/** `min`/`max` của `money` tính theo đơn vị nhỏ, `NumberField` lại làm việc theo đơn vị lớn. */
const numericMin = computed(() =>
  props.field.min === undefined
    ? undefined
    : props.field.dataType === 'money'
      ? props.field.min / minorPerMajor.value
      : props.field.min,
);
const numericMax = computed(() =>
  props.field.max === undefined
    ? undefined
    : props.field.dataType === 'money'
      ? props.field.max / minorPerMajor.value
      : props.field.max,
);

/** `exactOptionalPropertyTypes` không cho truyền thẳng `min: undefined`, nên chỉ gắn khi có giá trị. */
const numericRange = computed(() => {
  const range: { min?: number; max?: number } = {};
  if (numericMin.value !== undefined) range.min = numericMin.value;
  if (numericMax.value !== undefined) range.max = numericMax.value;
  return range;
});

const numericStep = computed(() => {
  if (props.field.dataType === 'decimal') return 1 / 10 ** decimalScale.value;
  if (props.field.dataType === 'money') return 1 / minorPerMajor.value;
  return 1;
});

function onNumericInput(value: number | null) {
  if (value === null) {
    emit('update:modelValue', null);
    return;
  }
  if (props.field.dataType === 'money') {
    const minor = Math.round(value * minorPerMajor.value);
    if (!Number.isSafeInteger(minor)) return;
    emit('update:modelValue', money(minor, currency.value));
    return;
  }
  if (props.field.dataType === 'decimal') {
    const scaled = Math.round(value * 10 ** decimalScale.value);
    if (!Number.isSafeInteger(scaled)) return;
    emit('update:modelValue', scaled);
    return;
  }
  emit('update:modelValue', value);
}

const booleanValue = computed(() => props.modelValue === true);

/** `Checkbox.Root` phát `boolean | undefined`; domain chỉ nhận boolean (field registry từ chối `undefined`). */
function onBooleanInput(value: boolean | undefined) {
  emit('update:modelValue', value === true);
}

const multiValue = computed<string[]>(() =>
  Array.isArray(props.modelValue) ? props.modelValue.filter((entry): entry is string => typeof entry === 'string') : [],
);

function onMultiInput(value: unknown) {
  emit('update:modelValue', Array.isArray(value) ? value : []);
}

const selectValue = computed(() => (typeof props.modelValue === 'string' ? props.modelValue : null));

function onSelectInput(value: unknown) {
  emit('update:modelValue', typeof value === 'string' && value !== '' ? value : null);
}

function optionLabel(option: FieldOption): string {
  return option.label[props.locale];
}

const selectedOptionLabel = computed(() => {
  const option = options.value.find((candidate) => candidate.value === selectValue.value);
  return option ? optionLabel(option) : '';
});

/** `formula` chỉ đọc: dùng formatter của field registry để không lặp lại luật hiển thị. */
const computedDisplay = computed(() => formatFieldValue(props.modelValue, props.field, props.locale));

/** `Input.Root`/`NumberField.Root` mới có `id` để `<label for>` trỏ tới. */
const labelTarget = computed(() => {
  const linkable: DataType[] = ['text', 'textarea', 'number', 'decimal', 'money', 'date', 'datetime', 'color', 'reference', 'image'];
  return linkable.includes(props.field.dataType) ? fieldId.value : undefined;
});
</script>

<template>
  <div class="grid gap-1" :data-field-type="field.dataType">
    <label v-if="labelTarget" class="field-label" :for="labelTarget">{{ label }}</label>
    <span v-else-if="field.dataType !== 'boolean'" class="field-label">{{ label }}</span>

    <!-- `formula` — giá trị đã tính, không nhập được. -->
    <output v-if="field.dataType === 'formula'" class="block rounded-sm bg-surface px-3 py-2 text-text-muted">{{ computedDisplay }}</output>

    <!-- `boolean` — nhãn nằm trong chính nút để bấm vào chữ cũng bật/tắt. -->
    <Checkbox.Root
      v-else-if="field.dataType === 'boolean'"
      class="inline-flex cursor-pointer items-center gap-2"
      :id="fieldId"
      :label="label"
      :name="field.key"
      :model-value="booleanValue"
      @update:model-value="onBooleanInput"
    >
      {{ label }}
    </Checkbox.Root>

    <!-- `multiselect` — một checkbox mỗi lựa chọn đã khai báo. -->
    <Checkbox.Group
      v-else-if="field.dataType === 'multiselect'"
      class="grid gap-2"
      :label="label"
      :model-value="multiValue"
      @update:model-value="onMultiInput"
    >
      <Checkbox.Root
        v-for="option in options"
        :key="option.value"
        class="inline-flex cursor-pointer items-center gap-2"
        :value="option.value"
      >
        {{ optionLabel(option) }}
      </Checkbox.Root>
    </Checkbox.Group>

    <!-- `number` / `decimal` / `money` — NumberField lo phần nhập số và bước nhảy. -->
    <NumberField.Root
      v-else-if="field.dataType === 'number' || field.dataType === 'decimal' || field.dataType === 'money'"
      :id="fieldId"
      :label="label"
      :name="field.key"
      :required="field.required"
      :model-value="numericValue"
      :step="numericStep"
      v-bind="numericRange"
      commit-on="input"
      @update:model-value="onNumericInput"
    >
      <NumberField.Control class="field-input" :placeholder="label" />
    </NumberField.Root>

    <!-- `select` — một lựa chọn trong danh sách đã khai báo. -->
    <Select.Root
      v-else-if="field.dataType === 'select'"
      :id="fieldId"
      :name="field.key"
      :model-value="selectValue"
      @update:model-value="onSelectInput"
    >
      <Select.Activator class="field-input flex items-center justify-between cursor-pointer" :label="label">
        <span :class="!selectValue ? 'text-text-muted/60' : 'text-text'">
          {{ selectedOptionLabel || label }}
        </span>
        <span class="text-xs text-text-muted ml-2">▼</span>
      </Select.Activator>
      <Select.Content eager class="panel-card p-1 shadow-xl max-h-60 overflow-y-auto min-w-[14rem] border border-border z-50 bg-surface">
        <Select.Item
          v-for="option in options"
          :key="option.value"
          :value="option.value"
          class="p-2 text-sm rounded-md cursor-pointer hover:bg-bg selected:(bg-primary text-primary-contrast font-medium) transition-colors text-text"
        >
          {{ optionLabel(option) }}
        </Select.Item>
      </Select.Content>
    </Select.Root>

    <!-- `textarea` — Vuetify0 không có Textarea; `Input.Control` render đa hình thành `<textarea>`. -->
    <Input.Root
      v-else-if="field.dataType === 'textarea'"
      :id="fieldId"
      :label="label"
      :name="field.key"
      :required="field.required"
      :model-value="textValue"
      @update:model-value="onTextInput"
    >
      <Input.Control as="textarea" rows="4" class="field-input" :placeholder="label" />
    </Input.Root>

    <!-- `text` / `date` / `datetime` / `color` / `reference` / `image`. -->
    <Input.Root
      v-else
      :id="fieldId"
      :label="label"
      :name="field.key"
      :type="inputType"
      :required="field.required"
      :model-value="textValue"
      @update:model-value="onTextInput"
    >
      <Input.Control class="field-input" :placeholder="label" />
    </Input.Root>

    <span class="text-sm text-text-muted" :data-type-hint="field.dataType">{{ typeLabel }}</span>
  </div>
</template>
