<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { UserDoc } from '@/core/auth/types';
import { useCurrentUser } from './use-current-user';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    user?: UserDoc | null;
    activeBranchName?: string;
  }>(),
  {
    open: false,
    user: null,
    activeBranchName: '',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'switchUser'): void;
  (e: 'logout'): void;
}>();

const { t } = useI18n();
const { logout } = useCurrentUser();

const menuRef = ref<HTMLElement | null>(null);
const placement = ref<'right' | 'left'>('right');

const initialLetter = computed(() => {
  if (!props.user?.displayName) return '?';
  return props.user.displayName.trim().charAt(0).toUpperCase();
});

function updatePlacement() {
  if (typeof window === 'undefined') return;
  const el = menuRef.value;
  if (!el) return;
  const container = el.closest('.relative') || el.parentElement;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const menuWidth = 288; // w-72 = 18rem = 288px

  // If right-0 would clip past the left edge of the viewport (< 12px), align to left-0
  if (rect.right < menuWidth + 12) {
    placement.value = 'left';
  } else {
    placement.value = 'right';
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      nextTick(updatePlacement);
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updatePlacement);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updatePlacement);
  }
});

function handleSwitchUser() {
  emit('switchUser');
  emit('close');
}

function handleLogout() {
  logout();
  emit('logout');
  emit('close');
}
</script>

<template>
  <div v-if="open && user">
    <!-- Click-outside backdrop -->
    <div
      data-test="profile-menu-backdrop"
      class="fixed inset-0 z-40 cursor-default"
      @click="emit('close')"
    ></div>

    <!-- Dropdown card -->
    <div
      ref="menuRef"
      data-test="user-profile-menu"
      :class="[
        'panel-card absolute top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] z-50 p-4 shadow-2xl bg-surface border border-border rounded-xl text-left space-y-3.5',
        placement === 'left' ? 'left-0' : 'right-0',
      ]"
    >
      <!-- User profile header -->
      <div class="flex items-center gap-3 pb-3 border-b border-border/80">
        <div class="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold text-base flex items-center justify-center shrink-0 border border-primary/20 select-none">
          {{ initialLetter }}
        </div>
        <div class="min-w-0 flex-1">
          <div class="text-sm font-bold text-text truncate">
            {{ user.displayName }}
          </div>
          <div class="text-xs font-mono text-text-muted truncate">
            @{{ user.username }}
          </div>
        </div>
      </div>

      <!-- Badges: Role, Auth Provider, Branch -->
      <div class="space-y-1.5 text-xs">
        <div class="flex items-center justify-between">
          <span class="text-text-muted">Vai trò:</span>
          <span class="font-semibold text-primary uppercase text-[11px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
            {{ t(`auth.role.${user.role}`) }}
          </span>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-text-muted">{{ t('auth.authProvider') }}:</span>
          <span class="font-medium text-text-muted text-[11px] px-2 py-0.5 rounded-md bg-surface-muted border border-border">
            {{ user.authProvider === 'logto' ? 'Logto SSO' : t('auth.localLogin') }}
          </span>
        </div>

        <div v-if="activeBranchName" class="flex items-center justify-between">
          <span class="text-text-muted">{{ t('auth.currentBranchLabel') }}:</span>
          <span class="font-medium text-text text-[11px] truncate max-w-[140px]">
            {{ activeBranchName }}
          </span>
        </div>
      </div>

      <!-- Action items -->
      <div class="pt-2 border-t border-border/80 space-y-1.5">
        <!-- Switch user button -->
        <Button.Root
          type="button"
          data-test="switch-user-btn"
          class="btn btn-ghost w-full justify-start text-xs py-2 px-2.5 rounded-lg text-text hover:bg-surface-muted flex items-center gap-2 cursor-pointer transition-colors"
          @click="handleSwitchUser"
        >
          <Button.Content>
            <span>🔄</span>
            <div class="text-left">
              <div class="font-semibold">{{ t('auth.switchUser') }}</div>
              <div class="text-[10px] text-text-muted font-normal">{{ t('auth.switchUserDesc') }}</div>
            </div>
          </Button.Content>
        </Button.Root>

        <!-- Logout button -->
        <Button.Root
          type="button"
          data-test="logout-btn"
          class="btn btn-ghost w-full justify-start text-xs py-2 px-2.5 rounded-lg text-danger hover:bg-danger/10 flex items-center gap-2 cursor-pointer transition-colors"
          @click="handleLogout"
        >
          <Button.Content>
            <span>🚪</span>
            <span class="font-bold">{{ t('auth.logout') }}</span>
          </Button.Content>
        </Button.Root>
      </div>
    </div>
  </div>
</template>
