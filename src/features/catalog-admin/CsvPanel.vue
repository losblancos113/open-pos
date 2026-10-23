<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button, Input, Progress } from '@vuetify/v0';
import type { CurrencyCode } from '@/core/money';
import type { CategoryDoc } from '@/core/catalog/category';
import type { ProductDoc } from '@/core/catalog/product';
import { exportCategoriesCsv, exportProductsCsv } from '@/core/catalog/csv-catalog';
import type { CsvRowError, ImportSummary } from '@/core/catalog/csv-catalog';

/**
 * Xuất / nhập menu bằng CSV — đường nhập "menu thật của quán" (checkpoint M2).
 *
 * Phân chia trách nhiệm: component này **không** gọi repository. Xuất thì core đã có đủ
 * dữ liệu trong props; nhập thì chỉ đọc tệp rồi phát `importProducts` / `importCategories`
 * cho `CatalogAdmin` — nơi duy nhất giữ trạng thái đang nhập / lỗi theo dòng / kết quả.
 *
 * Chọn tệp là **nhập luôn**, không có bước "bấm Nhập" thứ hai: D7 bắt sai một dòng thì
 * không ghi gì, nên lượt nhập hỏng không để lại hậu quả mà người dùng phải xác nhận trước.
 *
 * Tệp là `<input type="file">` thật, bọc trong `Input.Root`: Vuetify0 không có component
 * upload (AGENTS.md §4.8 — known gaps) và `Input.Control` không dùng được cho `type="file"`
 * vì nó bind `value` (trình duyệt chỉ cho gán chuỗi rỗng vào ô chọn tệp).
 */

const props = withDefaults(
  defineProps<{
    categories: readonly CategoryDoc[];
    products: readonly ProductDoc[];
    currency: CurrencyCode;
    /** Đang ghi một lượt nhập — hiện Progress, cha đã xoá kết quả cũ trước khi bật cờ này. */
    importing?: boolean;
    /** Lỗi theo dòng của lượt nhập gần nhất; có lỗi thì **không** hiện thông báo thành công. */
    errors?: readonly CsvRowError[];
    /** Kết quả lượt nhập đã ghi xong. */
    imported?: {
      readonly kind: 'categories' | 'products';
      readonly summary: ImportSummary;
    } | null;
  }>(),
  { importing: false, errors: () => [], imported: null },
);

const emit = defineEmits<{
  importCategories: [text: string];
  importProducts: [text: string];
}>();

const { t } = useI18n();

/** Lỗi khi xuất tệp (ví dụ menu trộn hai tiền tệ) — lỗi nhập có prop riêng vì có dòng/cột. */
const exportError = ref<string | null>(null);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Tải một chuỗi CSV xuống bằng object URL. Tên tệp để ASCII (`products.csv`) chứ không
 * lấy tên tiếng Việt: tệp còn phải đi qua hộp thoại lưu của Windows và mở bằng Excel.
 */
function downloadCsv(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  try {
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
    anchor.click();
  } finally {
    // Thu hồi ngay: trình duyệt đã nhận blob, giữ URL chỉ rò bộ nhớ.
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

function exportCategories(): void {
  exportError.value = null;
  try {
    downloadCsv('categories.csv', exportCategoriesCsv(props.categories));
  } catch (error) {
    exportError.value = messageOf(error);
  }
}

function exportProducts(): void {
  exportError.value = null;
  try {
    downloadCsv('products.csv', exportProductsCsv(props.products, props.currency));
  } catch (error) {
    exportError.value = messageOf(error);
  }
}

/**
 * Đọc tệp người dùng vừa chọn; `null` khi họ bỏ hộp thoại (không có tệp nào).
 *
 * Xoá `value` sau khi đọc để chọn lại **đúng tệp đó** vẫn bắn `change` — trình duyệt coi
 * một tệp không đổi là "không có gì thay đổi" và im lặng. Việc xoá phải sau `file.text()`:
 * đọc xong mới buông tệp ra.
 */
async function readFileText(event: Event): Promise<string | null> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  if (file === null) return null;

  // `file.text()` trả nguyên văn nội dung — kể cả BOM, thứ mà `parseCsv` tự bỏ.
  const text = await file.text();
  input.value = '';
  return text;
}

async function onCategoriesFile(event: Event): Promise<void> {
  const text = await readFileText(event);
  if (text === null) return;
  emit('importCategories', text);
}

async function onProductsFile(event: Event): Promise<void> {
  const text = await readFileText(event);
  if (text === null) return;
  emit('importProducts', text);
}
</script>

<template>
  <section class="grid gap-4">
    <h3 class="text-lg font-semibold">{{ t('catalog.csv.import.title') }}</h3>

    <div class="flex flex-wrap gap-2">
      <Button.Root type="button" class="btn-ghost" data-csv-export-categories @click="exportCategories">
        {{ t('catalog.csv.export.categories') }}
      </Button.Root>

      <Button.Root type="button" class="btn-ghost" data-csv-export-products @click="exportProducts">
        {{ t('catalog.csv.export.products') }}
      </Button.Root>
    </div>

    <p class="text-sm text-text-muted">{{ t('catalog.csv.import.hint') }}</p>

    <Input.Root class="grid gap-1">
      <label class="field-label">
        {{ t('catalog.tab.categories') }}
        <input
          type="file"
          class="field-input"
          accept=".csv,text/csv"
          data-import-categories
          :disabled="importing"
          @change="onCategoriesFile"
        />
      </label>
    </Input.Root>

    <Input.Root class="grid gap-1">
      <label class="field-label">
        {{ t('catalog.tab.products') }}
        <input
          type="file"
          class="field-input"
          accept=".csv,text/csv"
          data-import-products
          :disabled="importing"
          @change="onProductsFile"
        />
      </label>
    </Input.Root>

    <Progress.Root
      v-if="importing"
      :aria-label="t('catalog.csv.import.title')"
      class="panel-card grid gap-2"
    >
      <Progress.Track class="h-2 w-full overflow-hidden rounded-sm bg-bg">
        <Progress.Fill class="h-full bg-primary" />
      </Progress.Track>
      <p class="text-sm text-text-muted">{{ t('catalog.csv.import.title') }}</p>
    </Progress.Root>

    <Alert.Root v-if="errors.length > 0" data-csv-import-failed class="panel-card text-danger">
      <Alert.Title class="font-semibold">{{ t('catalog.csv.import.failed') }}</Alert.Title>

      <ul class="mt-2 flex flex-col gap-1 text-sm">
        <li v-for="(error, index) in errors" :key="index">
          {{
            t('catalog.csv.rowError', {
              row: error.row,
              column: error.column,
              message: error.message,
            })
          }}
        </li>
      </ul>
    </Alert.Root>

    <Alert.Root
      v-else-if="imported !== null"
      role="status"
      :data-csv-imported="imported.kind"
      class="panel-card"
    >
      <Alert.Description class="text-sm text-text-muted">
        {{
          t('catalog.csv.import.done', {
            created: imported.summary.created.length,
            updated: imported.summary.updated.length,
          })
        }}
      </Alert.Description>
    </Alert.Root>

    <Alert.Root v-if="exportError !== null" data-csv-export-failed class="panel-card text-danger">
      <Alert.Description class="text-sm">{{ exportError }}</Alert.Description>
    </Alert.Root>
  </section>
</template>
