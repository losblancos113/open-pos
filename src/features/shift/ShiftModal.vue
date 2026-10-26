<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@vuetify/v0';
import type { ShiftRepository } from '@/core/shift/shift-repository';
import type { ShiftCashMovementType } from '@/core/shift/types';
import { money, format } from '@/core/money';
import { useShift } from './useShift';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    repo?: ShiftRepository | null;
    branchId?: string;
    deviceId?: string;
    currentUser?: { userId?: string; username?: string; displayName: string } | null;
  }>(),
  {
    open: false,
    branchId: 'hq',
    deviceId: 'term_01',
    currentUser: null,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const shift = props.repo ? useShift(props.repo, () => props.branchId, () => props.deviceId) : null;

// Form state: Open shift
const openingCashAmount = ref<number>(500000);
const openNotes = ref('');

// Form state: Cash movement
const movementType = ref<ShiftCashMovementType>('cash_drop');
const movementAmount = ref<number>(100000);
const movementReason = ref('');
const movementMsg = ref(false);

// Form state: Close shift
const countedCashAmount = ref<number>(0);
const closeNotes = ref('');
const closeMsg = ref(false);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && shift) {
      shift.refresh().then(() => {
        if (shift.activeShift.value) {
          countedCashAmount.value = shift.activeShift.value.openingCash.minor;
        }
      });
      movementMsg.value = false;
      closeMsg.value = false;
    }
  },
  { immediate: true },
);

async function handleOpenShift() {
  if (!shift) return;
  const userId = props.currentUser?.userId || props.currentUser?.username || 'usr_default';
  const userName = props.currentUser?.displayName || 'Thu ngân';

  await shift.openShift({
    userId,
    userName,
    openingCash: money(Number(openingCashAmount.value), 'VND'),
    ...(openNotes.value.trim() ? { notes: openNotes.value.trim() } : {}),
  });
}

async function handleRecordCashMovement() {
  if (!shift || !shift.activeShift.value || movementAmount.value <= 0) return;
  const actorId = props.currentUser?.userId || props.currentUser?.username || 'usr_default';

  await shift.recordCashMovement(
    movementType.value,
    money(Number(movementAmount.value), 'VND'),
    movementReason.value.trim() || (movementType.value === 'cash_drop' ? 'Rút tiền mặt' : 'Bổ sung tiền mặt'),
    actorId,
  );

  movementReason.value = '';
  movementMsg.value = true;
  setTimeout(() => {
    movementMsg.value = false;
  }, 3000);
}

async function handleCloseShift() {
  if (!shift || !shift.activeShift.value) return;
  const closedBy = props.currentUser?.displayName || 'Thu ngân';
  const notes = closeNotes.value.trim();

  if (notes) {
    await shift.closeShift(
      money(Number(countedCashAmount.value), 'VND'),
      closedBy,
      notes,
    );
  } else {
    await shift.closeShift(
      money(Number(countedCashAmount.value), 'VND'),
      closedBy,
    );
  }

  closeMsg.value = true;
  setTimeout(() => {
    closeMsg.value = false;
  }, 3000);
}

const totalCashIn = computed(() => {
  if (!shift) return 0;
  return shift.cashMovements.value
    .filter((m) => m.type === 'cash_in')
    .reduce((sum, m) => sum + m.amount.minor, 0);
});

const totalCashDrop = computed(() => {
  if (!shift) return 0;
  return shift.cashMovements.value
    .filter((m) => m.type === 'cash_drop')
    .reduce((sum, m) => sum + m.amount.minor, 0);
});
</script>

<template>
  <div
    v-if="open"
    data-test="shift-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="panel-card w-full max-w-2xl p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b pb-3 border-border">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-text">{{ t('shift.title') }}</h2>
          <span
            v-if="shift && shift.isOpen.value"
            data-test="shift-status-pill"
            class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20"
          >
            🟢 {{ t('shift.active') }}
          </span>
          <span
            v-else
            class="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-text-muted/10 text-text-muted border border-border"
          >
            ⚪ {{ t('shift.noActive') }}
          </span>
        </div>
        <Button.Root
          type="button"
          data-test="close-shift-modal-btn"
          class="btn btn-ghost text-xs px-2.5 py-1"
          @click="emit('close')"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- State 1: No active shift -> Open shift form -->
      <div v-if="shift && !shift.isOpen.value" class="space-y-4" data-test="open-shift-form">
        <p class="text-xs text-text-muted">
          Hiện tại chưa có ca làm việc nào mở trên thiết bị này. Vui lòng kiểm đếm tiền mặt đầu ca để bắt đầu phiên bán hàng.
        </p>

        <form class="space-y-3" data-test="open-shift-btn" @submit.prevent="handleOpenShift">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.cashier') }}</label>
            <input
              type="text"
              class="field-input text-xs w-full rounded border border-border p-2 bg-surface/50 text-text font-medium"
              :value="currentUser?.displayName || 'Thu ngân'"
              disabled
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.openingCash') }} (VND)</label>
            <input
              v-model.number="openingCashAmount"
              type="number"
              min="0"
              step="1000"
              class="field-input text-xs w-full rounded border border-border p-2 font-mono text-base font-bold"
              required
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.notes') }}</label>
            <input
              v-model="openNotes"
              type="text"
              class="field-input text-xs w-full rounded border border-border p-2"
              placeholder="Ghi chú mở ca (nếu có)..."
            />
          </div>

          <Button.Root
            type="submit"
            class="btn btn-primary text-xs w-full py-2.5 mt-2"
          >
            <Button.Content>▶ {{ t('shift.open') }}</Button.Content>
          </Button.Root>
        </form>
      </div>

      <!-- State 2: Active shift -> Running stats, Cash Drop/In, Close shift -->
      <div v-else-if="shift && shift.isOpen.value" class="space-y-5" data-test="active-shift-panel">
        <!-- Shift Running Summary -->
        <div class="grid grid-cols-3 gap-3">
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('shift.openingCash') }}</div>
            <div class="text-base font-bold text-text font-mono mt-0.5">
              {{ format(shift.activeShift.value!.openingCash) }}
            </div>
          </div>
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('shift.cashIn') }}</div>
            <div class="text-base font-bold text-primary font-mono mt-0.5">
              +{{ format(money(totalCashIn, 'VND')) }}
            </div>
          </div>
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('shift.cashDrop') }}</div>
            <div class="text-base font-bold text-danger font-mono mt-0.5">
              -{{ format(money(totalCashDrop, 'VND')) }}
            </div>
          </div>
        </div>

        <!-- Section A: Cash In / Cash Drop Form -->
        <div class="border border-border rounded-lg p-4 bg-surface/30 space-y-3" data-test="cash-movement-form">
          <h3 class="text-xs font-bold text-text uppercase tracking-wider">
            Biến động tiền mặt trong ca (Cash In / Drop)
          </h3>

          <div v-if="movementMsg" class="p-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded">
            ✓ {{ t('shift.cashMovementSuccess') }}
          </div>

          <form class="space-y-3" @submit.prevent="handleRecordCashMovement">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-text-muted mb-1">Loại giao dịch</label>
                <select
                  v-model="movementType"
                  class="field-input text-xs w-full rounded border border-border p-2 bg-surface"
                >
                  <option value="cash_drop">{{ t('shift.cashDrop') }} (Rút vào két)</option>
                  <option value="cash_in">{{ t('shift.cashIn') }} (Nạp thêm tiền lẻ)</option>
                </select>
              </div>

              <div>
                <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.amount') }} (VND)</label>
                <input
                  v-model.number="movementAmount"
                  type="number"
                  min="1000"
                  step="1000"
                  class="field-input text-xs w-full rounded border border-border p-2 font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.reason') }}</label>
              <input
                v-model="movementReason"
                type="text"
                class="field-input text-xs w-full rounded border border-border p-2"
                placeholder="Ví dụ: Rút tiền mặt gửi két an toàn, bổ sung tiền trả lại..."
              />
            </div>

            <Button.Root
              type="submit"
              data-test="submit-cash-movement-btn"
              class="btn btn-ghost border border-border text-xs w-full py-2 hover:bg-surface"
            >
              <Button.Content>Ghi nhận biến động tiền</Button.Content>
            </Button.Root>
          </form>
        </div>

        <!-- Section B: Close Shift Form -->
        <div class="border border-border rounded-lg p-4 bg-surface/30 space-y-3" data-test="close-shift-form">
          <h3 class="text-xs font-bold text-text uppercase tracking-wider">
            {{ t('shift.close') }}
          </h3>

          <div v-if="closeMsg" class="p-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded">
            ✓ {{ t('shift.closeSuccess') }}
          </div>

          <form class="space-y-3" @submit.prevent="handleCloseShift">
            <div>
              <label class="block text-xs font-medium text-text-muted mb-1">
                {{ t('shift.countedCash') }} (Tiền mặt thực tế đếm được trong ngăn kéo)
              </label>
              <input
                v-model.number="countedCashAmount"
                type="number"
                min="0"
                step="1000"
                class="field-input text-xs w-full rounded border border-border p-2 font-mono text-base font-bold"
                required
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-text-muted mb-1">{{ t('shift.notes') }}</label>
              <input
                v-model="closeNotes"
                type="text"
                class="field-input text-xs w-full rounded border border-border p-2"
                placeholder="Ghi chú kết ca..."
              />
            </div>

            <Button.Root
              type="submit"
              data-test="close-shift-btn"
              class="btn btn-primary bg-danger text-white hover:bg-danger/90 text-xs w-full py-2.5 font-bold"
            >
              <Button.Content>⏹ {{ t('shift.confirmClose') }}</Button.Content>
            </Button.Root>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>
