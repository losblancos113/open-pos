<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertDialog, Button, DataTable, Input, NumberField } from '@vuetify/v0';
import type { CategoryDoc } from '@/core/catalog/category';
import { validateLocalizedName, validateSortOrder } from '@/core/catalog/validation';
import type { CatalogIssue, CatalogValidationCode } from '@/core/catalog/validation';
import type { LocalizedText } from '@/core/types/definition';

/**
 * Danh sách danh mục — chỉ render và phát ý định, không tự gọi repository.
 *
 * `CatalogAdmin` sở hữu dữ liệu và ghi xuống store, nên component này không có state
 * của miền: sửa xong nó phát `update` rồi quên đi, cha nạp lại và truyền props mới.
 */

defineProps<{ categories: readonly CategoryDoc[] }>();

const emit = defineEmits<{
  create: [name: LocalizedText, sortOrder: number];
  update: [id: string, patch: { name?: LocalizedText; sortOrder?: number }];
  remove: [id: string];
}>();

const { t } = useI18n();

/** Bản nháp. `en` để trống nghĩa là "dùng luôn tên tiếng Việt" — xem `localizedName`. */
const nameVi = ref('');
const nameEn = ref('');
const sortOrder = ref(0);

/** `_id` của danh mục đang sửa; `null` nghĩa là form đang tạo mới. */
const editingId = ref<string | null>(null);

/** Lỗi chỉ hiện sau lần lưu đầu tiên — không doạ người dùng ngay khi mở form. */
const submitted = ref(false);

/** Danh mục đang chờ xác nhận xoá; `null` khi hộp thoại đóng. */
const removalTarget = ref<CategoryDoc | null>(null);
const confirmOpen = ref(false);

/** Đóng hộp thoại (kể cả bằng nút huỷ) là quên mục tiêu — không xoá gì. */
watch(confirmOpen, (open) => {
  if (!open) removalTarget.value = null;
});

/**
 * Tên để lưu. Ô tiếng Anh bỏ trống thì lấy tên tiếng Việt: `validateLocalizedName`
 * đòi cả hai có nội dung, và menu Việt gần như luôn dùng chung một tên cho hai locale.
 */
function localizedName(): LocalizedText {
  const vi = nameVi.value.trim();
  const en = nameEn.value.trim();
  return { vi, en: en === '' ? vi : en };
}

/** Lỗi của bản nháp, lấy từ chính validator của core — UI không tự viết luật. */
const draftIssues = computed<readonly CatalogIssue[]>(() => [
  ...validateLocalizedName('name', localizedName()),
  ...validateSortOrder('sortOrder', sortOrder.value),
]);

/** Mã lỗi nào có bản dịch thì hiện bản dịch; còn lại giữ chẩn đoán kỹ thuật của core. */
const ISSUE_KEYS: Partial<Record<CatalogValidationCode, string>> = {
  missing_name: 'catalog.category.nameRequired',
};

function issueText(issue: CatalogIssue): string {
  const key = ISSUE_KEYS[issue.code];
  return key === undefined ? issue.message : t(key);
}

function onSortOrder(value: number | null): void {
  sortOrder.value = value === null ? 0 : value;
}

function resetForm(): void {
  nameVi.value = '';
  nameEn.value = '';
  sortOrder.value = 0;
  editingId.value = null;
  submitted.value = false;
}

function startEdit(category: CategoryDoc): void {
  editingId.value = category._id;
  nameVi.value = category.name.vi;
  nameEn.value = category.name.en;
  sortOrder.value = category.sortOrder;
  submitted.value = false;
}

function askRemove(category: CategoryDoc): void {
  removalTarget.value = category;
  confirmOpen.value = true;
}

function confirmRemove(): void {
  const target = removalTarget.value;
  if (target !== null) emit('remove', target._id);
  confirmOpen.value = false;
}

function onSubmit(): void {
  submitted.value = true;
  if (draftIssues.value.length > 0) return;

  const name = localizedName();
  const order = sortOrder.value;
  const id = editingId.value;

  if (id === null) emit('create', name, order);
  else emit('update', id, { name, sortOrder: order });

  resetForm();
}

const formEl = ref<HTMLFormElement | null>(null);

/**
 * `Button.Root` luôn render `type="button"` (Vuetify0 hardcode), nên nút lưu tự gọi
 * `requestSubmit()` — click của người dùng và đường submit của form chỉ còn một lối vào.
 */
function requestSubmit(): void {
  formEl.value?.requestSubmit();
}

/** Ô nhập hiện lỗi của chính nó — thông báo chung ở chân form là chỗ dự phòng. */
const nameIssue = computed(() =>
  submitted.value
    ? (draftIssues.value.find((issue) => issue.code === 'missing_name') ?? null)
    : null,
);

function isEditing(category: CategoryDoc): boolean {
  return editingId.value === category._id;
}
</script>

<template>
  <section class="grid gap-4">
    <h3 class="text-lg font-semibold">{{ t('catalog.tab.categories') }}</h3>

    <form ref="formEl" class="form-grid" data-category-form novalidate @submit.prevent="onSubmit">
      <Input.Root
        v-model="nameVi"
        data-category-name
        type="text"
        :label="t('catalog.field.name')"
      >
        <Input.Control class="field-input" />
      </Input.Root>

      <Input.Root
        v-model="nameEn"
        data-category-name-en
        type="text"
        :label="t('catalog.field.nameEn')"
      >
        <Input.Control class="field-input" />
      </Input.Root>

      <NumberField.Root
        data-category-sort-order
        :label="t('catalog.field.sortOrder')"
        :model-value="sortOrder"
        :min="0"
        :step="1"
        commit-on="input"
        @update:model-value="onSortOrder"
      >
        <NumberField.Control class="field-input" />
      </NumberField.Root>

      <p v-if="nameIssue !== null" class="error-text" role="alert">
        {{ issueText(nameIssue) }}
      </p>

      <div class="flex flex-wrap gap-2">
        <Button.Root type="button" class="btn-primary" data-form-submit @click="requestSubmit">
          {{ editingId === null ? t('catalog.category.new') : t('common.save') }}
        </Button.Root>

        <Button.Root v-if="editingId !== null" type="button" class="btn-ghost" data-category-cancel @click="resetForm">
          {{ t('common.cancel') }}
        </Button.Root>
      </div>
    </form>

    <div class="panel-card overflow-x-auto">
      <DataTable.Root>
        <DataTable.Table :aria-label="t('catalog.tab.categories')" class="w-full text-sm">
        <DataTable.Header>
          <DataTable.Row>
            <DataTable.Column id="name" class="table-cell">{{ t('catalog.field.name') }}</DataTable.Column>
            <DataTable.Column id="nameEn" class="table-cell">{{ t('catalog.field.nameEn') }}</DataTable.Column>
            <DataTable.Column id="sortOrder" class="table-cell">{{ t('catalog.field.sortOrder') }}</DataTable.Column>
            <DataTable.Column id="actions" class="table-cell">{{ t('common.actions') }}</DataTable.Column>
          </DataTable.Row>
        </DataTable.Header>

        <DataTable.Body>
          <DataTable.Row
            v-for="category in categories"
            :id="category._id"
            :key="category._id"
            :value="category"
            :data-category-row="category._id"
          >
            <DataTable.Cell class="table-cell">{{ category.name.vi }}</DataTable.Cell>
            <DataTable.Cell class="table-cell">{{ category.name.en }}</DataTable.Cell>
            <DataTable.Cell class="table-cell">{{ category.sortOrder }}</DataTable.Cell>
            <DataTable.Cell class="table-cell flex flex-wrap gap-2">
              <Button.Root
                type="button"
                class="btn-ghost"
                :data-category-edit="category._id"
                :aria-pressed="isEditing(category)"
                @click="startEdit(category)"
              >
                {{ t('common.edit') }}
              </Button.Root>

              <Button.Root
                type="button"
                class="btn-danger"
                :data-category-remove="category._id"
                @click="askRemove(category)"
              >
                {{ t('common.delete') }}
              </Button.Root>
            </DataTable.Cell>
          </DataTable.Row>

          <DataTable.Empty v-slot="{ columnCount }">
            <DataTable.Cell :colspan="columnCount" class="table-cell text-text-muted">{{ t('catalog.category.empty') }}</DataTable.Cell>
          </DataTable.Empty>
        </DataTable.Body>
      </DataTable.Table>
    </DataTable.Root>
  </div>

    <AlertDialog.Root v-model="confirmOpen">
      <AlertDialog.Content
        class="panel-card fixed top-1/2 left-1/2 w-96 max-w-full -translate-x-1/2 -translate-y-1/2"
        data-category-remove-dialog
      >
        <AlertDialog.Title class="text-lg font-semibold">{{ t('catalog.category.remove') }}</AlertDialog.Title>
        <AlertDialog.Description class="mt-2 text-sm text-text-muted">
          {{ t('catalog.category.removeConfirm', { name: removalTarget?.name.vi ?? '' }) }}
        </AlertDialog.Description>
        <div class="mt-4 flex justify-end gap-2">
          <AlertDialog.Cancel type="button" class="btn-ghost" data-category-remove-cancel>
            {{ t('common.cancel') }}
          </AlertDialog.Cancel>
          <AlertDialog.Action class="btn-danger" data-category-remove-confirm @action="confirmRemove">
            {{ t('common.delete') }}
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Root>
  </section>
</template>
