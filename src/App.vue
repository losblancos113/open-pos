<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { AlarmOutline, BarChartOutline, ChevronDown, CubeOutline, GridOutline, PeopleOutline, StatsChartOutline } from '@vicons/ionicons5';
import { onMounted, ref, computed, watch } from 'vue';
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
import { createUserRepository, type UserRepository } from '@/core/auth/user-repository';
import { createSystemRepository, type SystemRepository } from '@/core/system/system-repository';
import { useActiveBranch } from './features/branch/use-active-branch';
import { useCurrentUser } from './features/auth/use-current-user';
import { hashPin } from '@/core/auth/token';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import type { UserDoc } from '@/core/auth/types';
import TypeDesigner from './features/type-designer/TypeDesigner.vue';
import CatalogAdmin from './features/catalog-admin/CatalogAdmin.vue';
import PosTerminal from './features/pos/PosTerminal.vue';
import KitchenDisplay from './features/kds/KitchenDisplay.vue';
import BranchSwitcher from './features/branch/BranchSwitcher.vue';
import UserLoginModal from './features/auth/UserLoginModal.vue';
import UserAdminModal from './features/auth/UserAdminModal.vue';
import UserProfileMenu from './features/auth/UserProfileMenu.vue';
import InstallerWizard from './features/setup/InstallerWizard.vue';
import CrossBranchReportModal from './features/reports/CrossBranchReportModal.vue';
import InventoryAdminModal from './features/inventory/InventoryAdminModal.vue';
import ShiftModal from './features/shift/ShiftModal.vue';
import StoreReportsModal from './features/reports/StoreReportsModal.vue';
import TableAdminModal from './features/table-admin/TableAdminModal.vue';
import AppLogo from '@/components/AppLogo.vue';
import { createInventoryRepository, type InventoryRepository } from '@/core/inventory/inventory-repository';
import { createShiftRepository, type ShiftRepository } from '@/core/shift/shift-repository';
import { createOrderRepository, type OrderRepository } from '@/core/order/order-repository';

const { t } = useI18n();

type View = 'designer' | 'catalog' | 'pos' | 'kds';

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
const view = ref<View>('pos');

const adapter = ref<DbAdapter | null>(null);
const branchRepo = ref<BranchRepository | null>(null);
const userRepo = ref<UserRepository | null>(null);
const systemRepo = ref<SystemRepository | null>(null);
const storageError = ref<string | null>(null);

const { activeBranchId, currentBranch, init: initActiveBranch } = useActiveBranch();
const { currentUser, isOwner, can, isAuthenticated, restoreSession, logout } = useCurrentUser();

const isLoginModalOpen = ref(false);
const isUserAdminModalOpen = ref(false);
const isProfileMenuOpen = ref(false);
const isInstallerOpen = ref(false);
const isReportModalOpen = ref(false);
const isInventoryModalOpen = ref(false);
const isShiftModalOpen = ref(false);
const isStoreReportsModalOpen = ref(false);
const isTableAdminModalOpen = ref(false);
const inventoryRepo = ref<InventoryRepository | null>(null);
const shiftRepo = ref<ShiftRepository | null>(null);
const orderRepo = ref<OrderRepository | null>(null);
const posTerminalKey = ref(0);
const defaultUsers = ref<UserDoc[]>([]);

const activeBranchName = computed(
  () => currentBranch.value?.name || activeBranchId.value?.toUpperCase() || '',
);

function onTablesUpdated() {
  posTerminalKey.value++;
}

async function onInstallerComplete(adminUser: UserDoc, branchId: string) {
  isInstallerOpen.value = false;
  activeBranchId.value = branchId;
  if (userRepo.value) {
    defaultUsers.value = await userRepo.value.listUsers({ includeInactive: false });
  }
}

function onLoginSuccess(user: UserDoc) {
  isLoginModalOpen.value = false;
}

function onSwitchUser() {
  isProfileMenuOpen.value = false;
  isLoginModalOpen.value = true;
}

function onLogout() {
  isProfileMenuOpen.value = false;
}

onMounted(async () => {
  try {
    const rawAdapter = await createPouchAdapter(new PouchDB(LOCAL_DB_NAME));
    adapter.value = rawAdapter;

    const repo = createBranchRepository(rawAdapter);
    branchRepo.value = repo;
    const uRepo = createUserRepository(rawAdapter);
    userRepo.value = uRepo;
    const sRepo = createSystemRepository(rawAdapter);
    systemRepo.value = sRepo;
    inventoryRepo.value = createInventoryRepository(rawAdapter);
    shiftRepo.value = createShiftRepository(rawAdapter);
    orderRepo.value = createOrderRepository(rawAdapter);
    await repo.seedDefaultBranches();
    await initActiveBranch();

    restoreSession();

    const isFirst = await sRepo.isFirstRun();
    if (isFirst) {
      isInstallerOpen.value = true;
    }

    const dbUsers = await uRepo.listUsers({ includeInactive: true });
    defaultUsers.value = dbUsers;
  } catch (error) {
    storageError.value = error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <!-- First-run Installer Wizard -->
  <InstallerWizard
    v-if="branchRepo !== null && userRepo !== null && systemRepo !== null"
    :open="isInstallerOpen"
    :branch-repo="branchRepo"
    :user-repo="userRepo"
    :system-repo="systemRepo"
    @complete="onInstallerComplete"
  />

  <!-- Auth Gate: blocking full-screen login if not authenticated -->
  <UserLoginModal
    v-if="!isInstallerOpen && !isAuthenticated"
    :open="true"
    :is-gate="true"
    :users="defaultUsers"
    :user-repo="userRepo"
    :active-branch-id="activeBranchId"
    @login-success="onLoginSuccess"
  />

  <!-- Main Application (Only accessible when authenticated) -->
  <main v-if="isAuthenticated" class="app min-h-screen bg-bg text-text antialiased">
    <header class="app__header px-3 sm:px-6 py-3 sm:py-4 border-b border-border bg-surface/90 backdrop-blur-xs sticky top-0 z-30 flex flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Brand & Branch Info -->
        <div class="flex items-center gap-3">
          <AppLogo :size="32" />
          <div>
            <h1 class="text-base sm:text-lg font-bold tracking-tight leading-tight">{{ t('app.title') }}</h1>
            <p class="text-[11px] text-text-muted leading-none hidden sm:block">{{ t('app.tagline') }}</p>
          </div>

          <div class="ml-1 sm:ml-2 pl-2 sm:pl-3 border-l border-border/80">
            <BranchSwitcher
              v-if="branchRepo !== null"
              :branch-repo="branchRepo"
            />
          </div>
        </div>

        <!-- Controls: Cross-Branch Report, Inventory, Shift, Store Reports, User Session -->
        <div class="flex items-center gap-1.5 flex-wrap justify-end flex-1 min-w-0">
          <Button.Root
            v-if="isOwner"
            type="button"
            data-test="cross-branch-report-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('report.crossBranch')"
            @click="isReportModalOpen = true"
          >
            <Button.Content><AppIcon><BarChartOutline /></AppIcon> <span class="hidden lg:inline">{{ t('report.crossBranch') }}</span></Button.Content>
          </Button.Root>

          <Button.Root
            v-if="inventoryRepo !== null"
            type="button"
            data-test="inventory-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('inventory.title')"
            @click="isInventoryModalOpen = true"
          >
            <Button.Content><AppIcon><CubeOutline /></AppIcon> <span class="hidden lg:inline">{{ t('inventory.title') }}</span></Button.Content>
          </Button.Root>

          <Button.Root
            v-if="shiftRepo !== null"
            type="button"
            data-test="shift-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('shift.title')"
            @click="isShiftModalOpen = true"
          >
            <Button.Content><AppIcon><AlarmOutline /></AppIcon> <span class="hidden lg:inline">{{ t('shift.title') }}</span></Button.Content>
          </Button.Root>

          <Button.Root
            v-if="adapter !== null"
            type="button"
            data-test="store-reports-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('storeReports.title')"
            @click="isStoreReportsModalOpen = true"
          >
            <Button.Content><AppIcon><StatsChartOutline /></AppIcon> <span class="hidden lg:inline">{{ t('storeReports.title') }}</span></Button.Content>
          </Button.Root>

          <Button.Root
            v-if="orderRepo !== null"
            type="button"
            data-test="table-admin-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('tableAdmin.title')"
            @click="isTableAdminModalOpen = true"
          >
            <Button.Content><AppIcon><GridOutline /></AppIcon> <span class="hidden lg:inline">{{ t('tableAdmin.title') }}</span></Button.Content>
          </Button.Root>

          <Button.Root
            v-if="can('manage_users')"
            type="button"
            data-test="user-admin-btn"
            class="btn btn-ghost text-xs px-2 sm:px-2.5 py-1.5 rounded-md hover:bg-surface border border-border shadow-2xs"
            :title="t('auth.userManagement')"
            @click="isUserAdminModalOpen = true"
          >
            <Button.Content><AppIcon><PeopleOutline /></AppIcon> <span class="hidden lg:inline">{{ t('auth.userManagement') }}</span></Button.Content>
          </Button.Root>

          <!-- User profile button & Dropdown menu -->
          <div v-if="currentUser" class="relative shrink-0">
            <Button.Root
              type="button"
              data-test="user-profile-btn"
              class="btn btn-ghost text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-surface font-medium shadow-2xs flex items-center gap-1.5 cursor-pointer"
              @click="isProfileMenuOpen = !isProfileMenuOpen"
            >
              <Button.Content>
                <span class="inline-block w-2 h-2 rounded-full bg-success"></span>
                <span>{{ currentUser.displayName }}</span>
                <span class="text-[10px] text-text-muted uppercase">({{ currentUser.role }})</span>
                <span
                  v-if="currentUser.authProvider === 'logto'"
                  class="text-[9px] px-1 py-0.2 rounded bg-blue-500/20 text-blue-500 font-bold"
                >
                  Logto
                </span>
                <span class="text-[9px] text-text-muted ml-0.5"><AppIcon><ChevronDown /></AppIcon></span>
              </Button.Content>
            </Button.Root>

            <UserProfileMenu
              :open="isProfileMenuOpen"
              :user="currentUser"
              :active-branch-name="activeBranchName"
              @close="isProfileMenuOpen = false"
              @switch-user="onSwitchUser"
              @logout="onLogout"
            />
          </div>
          <Button.Root
            v-else
            type="button"
            data-test="login-btn"
            class="btn btn-primary text-xs px-3 py-1.5 rounded-md font-medium shadow-2xs shrink-0"
            @click="isLoginModalOpen = true"
          >
            <Button.Content>{{ t('auth.login') }}</Button.Content>
          </Button.Root>
        </div>
      </div>

      <nav class="app__nav w-full border-t border-border/60 pt-2 flex items-center overflow-x-auto">
        <Button.Group
          v-model="view"
          mandatory
          class="inline-flex gap-1 rounded-lg bg-surface p-1 border border-border shadow-2xs w-full sm:w-auto shrink-0"
        >
          <Button.Root
            type="button"
            value="pos"
            data-view="pos"
            class="flex-1 sm:flex-initial cursor-pointer rounded-md px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast font-semibold shadow-xs) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('pos.title') }}
          </Button.Root>

          <Button.Root
            type="button"
            value="kds"
            data-view="kds"
            class="flex-1 sm:flex-initial cursor-pointer rounded-md px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast font-semibold shadow-xs) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('kds.navTitle') }}
          </Button.Root>

          <Button.Root
            type="button"
            value="catalog"
            data-view="catalog"
            class="flex-1 sm:flex-initial cursor-pointer rounded-md px-3 sm:px-4 py-1.5 text-xs sm:text-sm font-medium transition-all text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast font-semibold shadow-xs) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('catalog.title') }}
          </Button.Root>
        </Button.Group>
      </nav>
    </header>

    <!-- `v-show`: đổi màn hình không được làm mất dữ liệu đang nhập của màn còn lại. -->
    <div v-show="view === 'pos'" class="px-3 sm:px-6 pt-4 pb-10">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <PosTerminal
        v-else-if="adapter !== null"
        :key="posTerminalKey"
        :adapter="adapter"
        :branch-id="activeBranchId"
        :current-user="currentUser"
        :active="view === 'pos'"
      />
      <p v-else>{{ t('common.loading') }}</p>
    </div>

    <div v-show="view === 'kds'" class="px-3 sm:px-6 pt-4 pb-10">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <KitchenDisplay
        v-else-if="adapter !== null"
        :adapter="adapter"
        :branch-id="activeBranchId"
        :active="view === 'kds'"
      />
      <p v-else>{{ t('common.loading') }}</p>
    </div>

    <div v-show="view === 'catalog'" class="px-3 sm:px-6 pt-4 pb-10">
      <p v-if="storageError !== null" role="alert">{{ storageError }}</p>
      <CatalogAdmin v-else-if="adapter !== null" :adapter="adapter" />
      <p v-else>{{ t('common.loading') }}</p>
    </div>

    <!-- Modals -->
    <section class="app__modals">
      <UserAdminModal
        v-if="userRepo !== null && branchRepo !== null"
        :open="isUserAdminModalOpen"
        :user-repo="userRepo"
        :branch-repo="branchRepo"
        @close="isUserAdminModalOpen = false"
      />

      <!-- Switch User Modal (when inside app) -->
      <UserLoginModal
        :open="isLoginModalOpen"
        :is-gate="false"
        :users="defaultUsers"
        :user-repo="userRepo"
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

      <InventoryAdminModal
        :open="isInventoryModalOpen"
        :repo="inventoryRepo"
        :branch-id="activeBranchId"
        @close="isInventoryModalOpen = false"
      />

      <ShiftModal
        :open="isShiftModalOpen"
        :repo="shiftRepo"
        :branch-id="activeBranchId"
        :device-id="'term_01'"
        :current-user="currentUser"
        @close="isShiftModalOpen = false"
      />

      <StoreReportsModal
        :open="isStoreReportsModalOpen"
        :adapter="adapter"
        :branch-id="activeBranchId"
        :current-user="currentUser"
        :order-repo="orderRepo"
        @close="isStoreReportsModalOpen = false"
      />

      <TableAdminModal
        :open="isTableAdminModalOpen"
        :branch-id="activeBranchId"
        :order-repo="orderRepo"
        @close="isTableAdminModalOpen = false"
        @tables-updated="onTablesUpdated"
      />
    </section>
  </main>
</template>
