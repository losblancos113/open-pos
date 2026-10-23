<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
// Bundle UMD tự chứa của PouchDB, **không** phải entry `pouchdb` chính: entry đó
// `import EE from 'events'` (Node builtin), mà Vite không polyfill builtin cho trình
// duyệt — bundle sẽ nạp module `events` rỗng rồi nổ ngay ở `new EE()`. Bản `dist` đã
// gói sẵn polyfill `events` bên trong nên chạy được trong WebView và trình duyệt.
import PouchDB from 'pouchdb/dist/pouchdb.js';
import type { DbAdapter } from '@/core/db/adapter';
import { createPouchAdapter } from '@/core/db/pouch-adapter';
import TypeDesigner from './features/type-designer/TypeDesigner.vue';
import CatalogAdmin from './features/catalog-admin/CatalogAdmin.vue';

const { t } = useI18n();

type View = 'designer' | 'catalog';

/**
 * Database cục bộ của terminal. PouchDB mở nó trên IndexedDB (WebView2 trong Tauri,
 * trình duyệt khi chạy `npm run dev`), nên dữ liệu còn nguyên sau khi tải lại trang —
 * điều kiện để catalog "dùng thật được", không chỉ để xem thử.
 */
const LOCAL_DB_NAME = 'openpos_local';

/**
 * M1 hoãn router (D5 của plan M1, D10 của plan M2): hai màn hình đổi nhau bằng `ref`.
 * Đổi route thật chỉ có nghĩa khi M3 thêm màn hình bán hàng.
 */
const view = ref<View>('designer');

const adapter = ref<DbAdapter | null>(null);
const storageError = ref<string | null>(null);

onMounted(async () => {
  try {
    adapter.value = await createPouchAdapter(new PouchDB(LOCAL_DB_NAME));
  } catch (error) {
    // Không mở được kho cục bộ thì phải nói ra: im lặng chuyển sang bộ nhớ tạm sẽ làm
    // admin tưởng menu đã lưu trong khi tải lại trang là mất sạch.
    storageError.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <main class="app">
    <header class="app__header">
      <h1>{{ t('app.title') }}</h1>
      <p>{{ t('app.tagline') }}</p>

      <nav class="app__nav">
        <!--
          `Button.Group` chứ không phải hai `Button.Root` rời: ButtonRoot chỉ gắn
          `aria-pressed` khi nó đăng ký với một group (`group ? isSelected.value : void 0`),
          và nó merge attrs của nó SAU attrs người dùng — nên ngoài group, `aria-pressed`
          bind từ đây bị ghi đè thành `undefined` và rơi khỏi DOM. Trong group, group giữ
          trạng thái chọn, `aria-pressed` đúng theo `v-model`, và `mandatory` chặn việc bỏ
          chọn màn đang mở (bấm lại tab hiện tại không được làm màn hình trắng).
        -->
        <Button.Group v-model="view" mandatory>
          <Button.Root type="button" value="designer" data-view="designer">
            {{ t('type.designer.title') }}
          </Button.Root>

          <Button.Root type="button" value="catalog" data-view="catalog">
            {{ t('catalog.title') }}
          </Button.Root>
        </Button.Group>
      </nav>
    </header>

    <!-- `v-show`: đổi màn hình không được làm mất dữ liệu đang nhập của màn còn lại. -->
    <div v-show="view === 'designer'">
      <TypeDesigner />
    </div>

    <div v-show="view === 'catalog'">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <CatalogAdmin v-else-if="adapter !== null" :adapter="adapter" />
      <p v-else>{{ t('common.loading') }}</p>
    </div>
  </main>
</template>
