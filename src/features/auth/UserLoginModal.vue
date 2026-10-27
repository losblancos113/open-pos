<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { UserDoc } from '@/core/auth/types';
import { useCurrentUser } from './use-current-user';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    users?: UserDoc[];
    activeBranchId?: string;
  }>(),
  {
    open: false,
    users: () => [],
    activeBranchId: 'hq',
  },
);

const emit = defineEmits<{
  (e: 'loginSuccess', user: UserDoc, token: string): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();
const { login, sessionToken } = useCurrentUser();

const selectedUserId = ref<string>('');
const enteredPin = ref<string>('');
const errorMessage = ref<string | null>(null);

watch(
  () => props.users,
  (newUsers) => {
    if (newUsers.length > 0 && !selectedUserId.value) {
      selectedUserId.value = newUsers[0]!._id;
    }
  },
  { immediate: true },
);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      enteredPin.value = '';
      errorMessage.value = null;
      if (props.users.length > 0 && !selectedUserId.value) {
        selectedUserId.value = props.users[0]!._id;
      }
    }
  },
);

const selectedUser = computed(() =>
  props.users.find((u) => u._id === selectedUserId.value) ?? props.users[0] ?? null,
);

const pinMask = computed(() => {
  if (!enteredPin.value) return '';
  return '• '.repeat(enteredPin.value.length).trim();
});

function appendDigit(digit: number) {
  errorMessage.value = null;
  if (enteredPin.value.length < 6) {
    enteredPin.value += String(digit);
  }
}

function handleClear() {
  errorMessage.value = null;
  enteredPin.value = '';
}

function handleBackspace() {
  errorMessage.value = null;
  if (enteredPin.value.length > 0) {
    enteredPin.value = enteredPin.value.slice(0, -1);
  }
}

async function handleLogin() {
  if (!selectedUser.value) {
    errorMessage.value = 'Chưa chọn tài khoản';
    return;
  }
  if (!enteredPin.value) {
    errorMessage.value = t('auth.enterPin');
    return;
  }

  const result = await login(selectedUser.value, enteredPin.value, props.activeBranchId);
  if (result.success && sessionToken.value) {
    emit('loginSuccess', selectedUser.value, sessionToken.value);
  } else {
    if (result.error?.startsWith('locked_out:')) {
      errorMessage.value = t('auth.lockedOut');
    } else {
      errorMessage.value = t('auth.invalidPin');
    }
    enteredPin.value = '';
  }
}

function quickFillPin(pin: string, roleKeyword?: string) {
  if (roleKeyword) {
    const target = props.users.find((u) => u.role === roleKeyword || u.username.includes(roleKeyword));
    if (target) {
      selectedUserId.value = target._id;
    }
  }
  enteredPin.value = pin;
  errorMessage.value = null;
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    @click.self="emit('cancel')"
  >
    <div class="panel-card w-full max-w-sm p-6 space-y-4 shadow-xl relative">
      <!-- Header với nút đóng ✕ -->
      <div class="flex items-start justify-between">
        <div class="flex-1 text-center pl-7">
          <h2 class="text-lg font-bold text-text">{{ t('auth.login') }}</h2>
          <p class="text-xs text-text-muted mt-1">{{ t('auth.enterPin') }}</p>
        </div>
        <Button.Root
          type="button"
          data-test="close-login-btn"
          class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full cursor-pointer flex items-center justify-center text-text-muted hover:text-text shrink-0"
          @click="emit('cancel')"
        >
          ✕
        </Button.Root>
      </div>

      <!-- Gợi ý mã PIN mặc định -->
      <div class="p-2.5 rounded-lg bg-surface border border-border text-xs text-text-muted space-y-1.5">
        <div class="font-medium text-text flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <span>💡</span>
            <span>Mã PIN mặc định:</span>
          </span>
          <span class="text-[10px] text-text-muted font-normal">(Chạm để điền nhanh)</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <button
            type="button"
            class="flex items-center justify-between p-1.5 rounded border border-border/60 bg-bg hover:border-primary/60 cursor-pointer transition-all"
            @click="quickFillPin('1234', 'owner')"
          >
            <span class="truncate">Chủ quán:</span>
            <span class="font-mono font-bold text-primary ml-1">1234</span>
          </button>
          <button
            type="button"
            class="flex items-center justify-between p-1.5 rounded border border-border/60 bg-bg hover:border-primary/60 cursor-pointer transition-all"
            @click="quickFillPin('1111', 'cashier')"
          >
            <span class="truncate">Thu ngân:</span>
            <span class="font-mono font-bold text-primary ml-1">1111</span>
          </button>
        </div>
      </div>

      <!-- User selection -->
      <div class="space-y-1">
        <label class="field-label text-xs font-medium text-text-muted">Tài khoản</label>
        <select
          v-model="selectedUserId"
          data-test="user-select"
          class="field-input w-full p-2 border border-border rounded bg-surface text-sm"
        >
          <option
            v-for="user in users"
            :key="user._id"
            :value="user._id"
          >
            {{ user.displayName }} ({{ t(`auth.role.${user.role}`) }})
          </option>
        </select>
      </div>

      <!-- PIN Display -->
      <div
        data-test="pin-display"
        class="h-12 flex items-center justify-center text-xl font-mono tracking-widest border border-border rounded bg-bg text-primary font-bold select-none"
      >
        <span v-if="enteredPin">{{ pinMask }}</span>
        <span v-else class="text-xs text-text-muted font-normal">Chạm phím số bên dưới</span>
      </div>

      <!-- Error message -->
      <div
        v-if="errorMessage"
        data-test="login-error"
        class="p-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded text-center"
      >
        {{ errorMessage }}
      </div>

      <!-- Keypad grid -->
      <div class="grid grid-cols-3 gap-2">
        <Button.Root
          v-for="n in 9"
          :key="n"
          type="button"
          :data-test="`keypad-${n}`"
          class="btn btn-ghost h-12 text-lg font-semibold rounded bg-surface hover:bg-bg border border-border flex items-center justify-center select-none"
          @click="appendDigit(n)"
        >
          <Button.Content>{{ n }}</Button.Content>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="keypad-clear"
          class="btn btn-ghost h-12 text-sm font-medium rounded text-text-muted hover:bg-bg border border-border flex items-center justify-center select-none"
          @click="handleClear"
        >
          <Button.Content>C</Button.Content>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="keypad-0"
          class="btn btn-ghost h-12 text-lg font-semibold rounded bg-surface hover:bg-bg border border-border flex items-center justify-center select-none"
          @click="appendDigit(0)"
        >
          <Button.Content>0</Button.Content>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="keypad-backspace"
          class="btn btn-ghost h-12 text-lg font-medium rounded text-text-muted hover:bg-bg border border-border flex items-center justify-center select-none"
          @click="handleBackspace"
        >
          <Button.Content>⌫</Button.Content>
        </Button.Root>
      </div>

      <!-- Action buttons -->
      <div class="flex items-center gap-2">
        <Button.Root
          type="button"
          data-test="login-cancel-btn"
          class="btn btn-ghost flex-1 py-2.5 text-sm font-medium rounded cursor-pointer"
          @click="emit('cancel')"
        >
          <Button.Content>{{ t('common.cancel') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="login-submit-btn"
          class="btn btn-primary flex-1 py-2.5 text-sm font-medium rounded cursor-pointer"
          @click="handleLogin"
        >
          <Button.Content>{{ t('auth.login') }}</Button.Content>
        </Button.Root>
      </div>
    </div>
  </div>
</template>
