<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import type { CategoryPatch } from '@/core/catalog/catalog-repository';
import { createCatalogRepository } from '@/core/catalog/catalog-repository';
import type { CategoryDoc } from '@/core/catalog/category';
import { slugify } from '@/core/slug';
import type { LocalizedText } from '@/core/types/definition';
import CategoryList from './CategoryList.vue';

/**
 * Màn hình quản lý menu — nơi duy nhất sở hữu dữ liệu catalog.
 *
 * Các component con chỉ render và phát ý định (tạo/sửa/xoá); mọi lần ghi đi qua đây
 * rồi nạp lại từ store. Nhờ vậy danh sách luôn là thứ vừa đọc từ DB, không phải một
 * bản sao trong bộ nhớ có thể lệch khỏi `_rev` thật.
 *
 * `adapter` là prop bắt buộc để test bơm memory adapter — không có đường nào cho
 * component này tự mở PouchDB.
 */

const props = defineProps<{ adapter: DbAdapter }>();

const { t } = useI18n();

interface Tab {
  readonly key: 'categories';
  readonly labelKey: string;
}

/** Chỉ những tab đã có màn hình thật — không render tab dẫn tới màn hình trắng. */
const TABS: readonly Tab[] = [{ key: 'categories', labelKey: 'catalog.tab.categories' }];

const activeTab = ref<Tab['key']>('categories');

const repository = createCatalogRepository(props.adapter);

const categories = ref<readonly CategoryDoc[]>([]);
const loading = ref(true);
const loadError = ref<string | null>(null);
const saveError = ref<string | null>(null);

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function reload(): Promise<void> {
  loadError.value = null;
  try {
    categories.value = await repository.listCategories();
  } catch (error) {
    loadError.value = messageOf(error);
  } finally {
    loading.value = false;
  }
}

onMounted(reload);

/**
 * `_rev` là điều kiện chống ghi đè chéo giữa hai terminal. Document thiếu `_rev` là
 * bất thường — ném lỗi để hiện lên màn hình, không ghi mù đè lên bản của máy khác.
 */
function requireRev(doc: { readonly _id: string; readonly _rev?: string }): string {
  if (doc._rev === undefined) {
    throw new Error(`catalog document ${JSON.stringify(doc._id)} has no _rev`);
  }
  return doc._rev;
}

/** `_id` dạng `category:drinks` → segment `drinks` mà repository nhận. */
function categorySegment(docId: string): string {
  const prefix = 'category:';
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

async function run(action: () => Promise<unknown>): Promise<void> {
  saveError.value = null;
  try {
    await action();
    await reload();
  } catch (error) {
    saveError.value = messageOf(error);
  }
}

async function createCategory(name: LocalizedText, sortOrder: number): Promise<void> {
  await run(() => repository.createCategory({ id: slugify(name.vi), name, sortOrder }));
}

async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  const current = categories.value.find((category) => category._id === id);
  if (current === undefined) return;
  await run(() => repository.updateCategory(categorySegment(id), patch, requireRev(current)));
}

async function removeCategory(id: string): Promise<void> {
  const current = categories.value.find((category) => category._id === id);
  if (current === undefined) return;
  await run(() => repository.removeCategory(categorySegment(id), requireRev(current)));
}
</script>

<template>
  <section class="catalog-admin">
    <h2>{{ t('catalog.title') }}</h2>

    <p v-if="loadError !== null" role="alert">{{ loadError }}</p>

    <nav class="catalog-admin__tabs">
      <Button.Root
        v-for="tab in TABS"
        :key="tab.key"
        type="button"
        :data-catalog-tab="tab.key"
        :aria-pressed="activeTab === tab.key"
        @click="activeTab = tab.key"
      >
        {{ t(tab.labelKey) }}
      </Button.Root>
    </nav>

    <p v-if="loading">{{ t('common.loading') }}</p>

    <p v-if="saveError !== null" role="alert">{{ saveError }}</p>

    <CategoryList
      v-if="activeTab === 'categories'"
      :categories="categories"
      @create="createCategory"
      @update="updateCategory"
      @remove="removeCategory"
    />
  </section>
</template>
