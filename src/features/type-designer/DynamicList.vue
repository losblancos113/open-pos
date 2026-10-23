<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { DataTable } from '@vuetify/v0';
import { buildListModel } from '@/core/types/read-model';
import type { TypeDefinition } from '@/core/types/definition';
import type { SupportedLocale } from '@/i18n';

const props = withDefaults(
  defineProps<{
    definition: TypeDefinition;
    records: readonly Record<string, unknown>[];
    locale?: SupportedLocale;
  }>(),
  { locale: 'vi' },
);

const { t } = useI18n();

/**
 * Cùng quy tắc chọn cột với `buildListModel`: chưa cấu hình `listView` thì lấy mọi field.
 * Nếu hai bên lệch nhau, số ô mỗi hàng sẽ không khớp số cột.
 */
const columnKeys = computed<readonly string[]>(() =>
  props.definition.listView.length > 0
    ? props.definition.listView
    : props.definition.fields.map((field) => field.key),
);

const columns = computed(() => {
  const byKey = new Map(props.definition.fields.map((field) => [field.key, field]));
  return columnKeys.value.map((key) => {
    const field = byKey.get(key);
    // Validation chặn `listView` trỏ tới field không khai báo; ở đây chỉ cần không vỡ UI.
    const label = field === undefined ? key : field.label[props.locale];
    const computedField = field?.dataType === 'formula';
    return {
      key,
      computed: computedField,
      label: computedField ? `${label} (${t('type.field.computed')})` : label,
    };
  });
});

/** Ô dùng `buildListModel` (Task 11) — SFC không tự format giá trị. */
function cells(record: Record<string, unknown>) {
  return buildListModel(props.definition, record, props.locale);
}

/** `_id` là khoá ổn định của record; chỉ rơi về chỉ số khi dữ liệu chưa có `_id`. */
function rowId(record: Record<string, unknown>, index: number): string {
  const raw = record['_id'];
  return typeof raw === 'string' && raw !== '' ? raw : `row-${index}`;
}
</script>

<template>
  <div class="panel-card overflow-x-auto">
    <DataTable.Root>
      <DataTable.Table :aria-label="definition.name[locale]" class="w-full text-sm">
        <DataTable.Header>
          <DataTable.Row>
            <DataTable.Column
              v-for="column in columns"
              :key="column.key"
              :id="column.key"
              :data-computed="column.computed ? 'true' : undefined"
              class="table-cell font-medium"
            >
              {{ column.label }}
            </DataTable.Column>
          </DataTable.Row>
        </DataTable.Header>

        <DataTable.Body>
          <DataTable.Row
            v-for="(record, index) in records"
            :id="rowId(record, index)"
            :key="rowId(record, index)"
            :value="record"
          >
            <DataTable.Cell v-for="cell in cells(record)" :key="cell.key" class="table-cell">
              {{ cell.text }}
            </DataTable.Cell>
          </DataTable.Row>

          <DataTable.Empty v-slot="{ columnCount }">
            <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('type.list.empty') }}</DataTable.Cell>
          </DataTable.Empty>
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  </div>
</template>
