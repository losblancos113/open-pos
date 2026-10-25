<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
// Bundle UMD tự chứa của PouchDB, **không** phải entry `pouchdb` chính: entry đó
// `import EE from 'events'` (Node builtin), mà Vite không polyfill builtin cho trình
// duyệt — bundle sẽ nạp module `events` rỗng rồi nổ ngay ở `new EE()`. Bản `dist` đã
// gói sẵn polyfill `events` bên trong nên chạy được trong WebView và trình duyệt.
import PouchDB from 'pouchdb/dist/pouchdb.js';
import type { DbAdapter } from '@/core/db/adapter';
import { createPouchAdapter } from '@/core/db/pouch-adapter';
import { createBranchRepository, type BranchRepository } from '@/core/branch/branch-repository';
import { useActiveBranch } from './features/branch/use-active-branch';
import { useCurrentUser } from './features/auth/use-current-user';
import { hashPin } from '@/core/auth/token';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import type { UserDoc } from '@/core/auth/types';
import TypeDesigner from './features/type-designer/TypeDesigner.vue';
import CatalogAdmin from './features/catalog-admin/CatalogAdmin.vue';
import PosTerminal from './features/pos/PosTerminal.vue';
import BranchSwitcher from './features/branch/BranchSwitcher.vue';
import UserLoginModal from './features/auth/UserLoginModal.vue';
import CrossBranchReportModal from './features/reports/CrossBranchReportModal.vue';

const { t } = useI18n();

type View = 'designer' | 'catalog' | 'pos';

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
const branchRepo = ref<BranchRepository | null>(null);
const storageError = ref<string | null>(null);

const { activeBranchId, init: initActiveBranch } = useActiveBranch();
const { currentUser, isOwner, login } = useCurrentUser();

const isLoginModalOpen = ref(false);
const isReportModalOpen = ref(false);
const defaultUsers = ref<UserDoc[]>([]);

onMounted(async () => {
  try {
    const rawAdapter = await createPouchAdapter(new PouchDB(LOCAL_DB_NAME));
    adapter.value = rawAdapter;

    const repo = createBranchRepository(rawAdapter);
    branchRepo.value = repo;
    await repo.seedDefaultBranches();
    await initActiveBranch();

    defaultUsers.value = [
      {
        _id: 'user:admin',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'admin',
        displayName: 'Quản trị viên (Chủ quán)',
        pinHash: hashPin('1234'),
        role: 'owner',
        branchIds: ['hq', 'dist1'],
        isActive: true,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'user:cashier_hq',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'cashier1',
        displayName: 'Thu ngân HQ',
        pinHash: hashPin('1111'),
        role: 'cashier',
        branchIds: ['hq'],
        isActive: true,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Default to owner session if none active
    if (!currentUser.value && defaultUsers.value[0]) {
      await login(defaultUsers.value[0], '1234', activeBranchId.value);
    }
  } catch (error) {
    // Không mở được kho cục bộ thì phải nói ra: im lặng chuyển sang bộ nhớ tạm sẽ làm
    // admin tưởng menu đã lưu trong khi tải lại trang là mất sạch.
    storageError.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <main class="app min-h-screen bg-bg text-text">
    <header class="app__header px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold">{{ t('app.title') }}</h1>
        <p class="text-xs text-text-muted">{{ t('app.tagline') }}</p>
      </div>

      <!-- Controls: Branch Switcher, Cross-Branch Report, User Session -->
      <div class="flex items-center gap-2">
        <BranchSwitcher
          v-if="branchRepo !== null"
          :branch-repo="branchRepo"
        />

        <Button.Root
          v-if="isOwner"
          type="button"
          data-test="cross-branch-report-btn"
          class="btn btn-ghost text-xs px-2.5 py-1.5 rounded hover:bg-surface border border-border"
          @click="isReportModalOpen = true"
        >
          <Button.Content>📊 {{ t('report.crossBranch') }}</Button.Content>
        </Button.Root>

        <!-- User profile button -->
        <Button.Root
          v-if="currentUser"
          type="button"
          data-test="user-profile-btn"
          class="btn btn-ghost text-xs px-2.5 py-1.5 rounded border border-border hover:bg-surface font-medium"
          @click="isLoginModalOpen = true"
        >
          <Button.Content>👤 {{ currentUser.displayName }}</Button.Content>
        </Button.Root>
        <Button.Root
          v-else
          type="button"
          data-test="login-btn"
          class="btn btn-primary text-xs px-3 py-1.5 rounded font-medium"
          @click="isLoginModalOpen = true"
        >
          <Button.Content>{{ t('auth.login') }}</Button.Content>
        </Button.Root>
      </div>

      <nav class="app__nav w-full mt-2">
        <!--
          `Button.Group` chứ không phải hai `Button.Root` rời: ButtonRoot chỉ gắn
          `aria-pressed` khi nó đăng ký với một group (`group ? isSelected.value : void 0`),
          và nó merge attrs của nó SAU attrs người dùng — nên ngoài group, `aria-pressed`
          bind từ đây bị ghi đè thành `undefined` và rơi khỏi DOM. Trong group, group giữ
          trạng thái chọn, `aria-pressed` đúng theo `v-model`, và `mandatory` chặn việc bỏ
          chọn màn đang mở (bấm lại tab hiện tại không được làm màn hình trắng).
        -->
        <Button.Group
          v-model="view"
          mandatory
          class="inline-flex gap-1 rounded-md bg-surface p-1 shadow-sm"
        >
          <!--
            Tab đang mở được style qua `data-selected` do Button.Root tự gắn khi ở trong
            group — không tự toggle class. Hover phải loại tab đang chọn
            (`[&:not([data-selected])]:hover:*`), nếu không nó ghi đè màu chữ của tab chọn.
          -->
          <Button.Root
            type="button"
            value="designer"
            data-view="designer"
            class="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('type.designer.title') }}
          </Button.Root>

          <Button.Root
            type="button"
            value="catalog"
            data-view="catalog"
            class="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('catalog.title') }}
          </Button.Root>

          <Button.Root
            type="button"
            value="pos"
            data-view="pos"
            class="cursor-pointer rounded-sm px-3 py-2 text-sm font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('pos.title') }}
          </Button.Root>
        </Button.Group>
      </nav>
    </header>

    <!-- `v-show`: đổi màn hình không được làm mất dữ liệu đang nhập của màn còn lại. -->
    <div v-show="view === 'designer'" class="px-6 pb-10">
      <TypeDesigner />
    </div>

    <div v-show="view === 'catalog'" class="px-6 pb-10">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <CatalogAdmin v-else-if="adapter !== null" :adapter="adapter" />
      <p v-else>{{ t('common.loading') }}</p>
    </div>

    <div v-show="view === 'pos'" class="px-6 pb-10">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <PosTerminal
        v-else-if="adapter !== null"
        :adapter="adapter"
        :branch-id="activeBranchId"
      />
      <p v-else>{{ t('common.loading') }}</p>
    </div>

    <!-- Modals -->
    <UserLoginModal
      :open="isLoginModalOpen"
      :users="defaultUsers"
      :active-branch-id="activeBranchId"
      @login-success="isLoginModalOpen = false"
      @cancel="isLoginModalOpen = false"
    />

    <CrossBranchReportModal
      :open="isReportModalOpen"
      :adapter="adapter"
      :branch-repo="branchRepo"
      @close="isReportModalOpen = false"
    />
  </main>
</template>
