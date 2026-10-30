<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { Checkmark, Close } from '@vicons/ionicons5';
import { ref, computed, watch } from 'vue';
import { Button, Checkbox } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import type { BillDoc } from '@/core/order/types';
import { money, format } from '@/core/money';

const props = defineProps<{
  bills: BillDoc[];
  open: boolean;
  tableNames?: Record<string, string> | undefined;
  currentBillId?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  /** Emits the full selection payload so the parent can dispatch the merge. */
  confirmMerge: [payload: { billIds: string[] }];
}>();

const { t } = useI18n();

const selectedBillIds = ref<string[]>([]);

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      if (props.currentBillId && props.bills.some((b) => b._id === props.currentBillId)) {
        selectedBillIds.value = [props.currentBillId];
      } else {
        selectedBillIds.value = [];
      }
    }
  },
  { immediate: true }
);

const selectedBills = computed<BillDoc[]>(() =>
  props.bills.filter((b) => selectedBillIds.value.includes(b._id))
);

const mergedTotal = computed(() => {
  if (selectedBills.value.length === 0) {
    return money(0, 'VND');
  }
  const totalMinor = selectedBills.value.reduce((sum, b) => sum + b.balanceRemaining.minor, 0);
  return money(totalMinor, props.bills[0]?.balanceRemaining.currency ?? 'VND');
});

function toggleBill(billId: string) {
  const idx = selectedBillIds.value.indexOf(billId);
  if (idx >= 0) {
    selectedBillIds.value.splice(idx, 1);
  } else {
    selectedBillIds.value.push(billId);
  }
}

function toggleSelectAll() {
  if (selectedBillIds.value.length === props.bills.length) {
    selectedBillIds.value = [];
  } else {
    selectedBillIds.value = props.bills.map((b) => b._id);
  }
}

function canConfirm() {
  return selectedBillIds.value.length >= 2;
}

function handleConfirm() {
  if (!canConfirm()) return;
  emit('confirmMerge', { billIds: [...selectedBillIds.value] });
  emit('close');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
    <div class="merge-bills-dialog panel-card max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-border pb-3">
        <h3 class="text-base sm:text-lg font-bold text-text">{{ t('pos.split.merge') }}</h3>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text cursor-pointer"
          @click="handleClose"
        >
          <AppIcon><Close /></AppIcon>
        </Button.Root>
      </div>

      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <p class="text-xs text-text-muted">
            Chọn các hoá đơn để gộp (tối thiểu 2):
          </p>
          <button
            v-if="bills.length > 1"
            type="button"
            class="text-xs text-primary font-medium hover:underline cursor-pointer"
            @click="toggleSelectAll"
          >
            {{ selectedBillIds.length === bills.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
          </button>
        </div>

        <div class="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
          <div
            v-for="bill in bills"
            :key="bill._id"
            role="checkbox"
            :aria-checked="selectedBillIds.includes(bill._id)"
            data-test="bill-row"
            class="flex items-center gap-3 p-3.5 border rounded-lg cursor-pointer transition-all select-none"
            :class="selectedBillIds.includes(bill._id)
              ? 'border-primary bg-primary/5 shadow-xs'
              : 'border-border bg-surface hover:border-primary/40 hover:bg-surface/80'"
            @click="toggleBill(bill._id)"
          >
            <Checkbox.Root
              data-test="bill-checkbox"
              :model-value="selectedBillIds.includes(bill._id)"
              class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer"
              :class="selectedBillIds.includes(bill._id)
                ? 'border-primary bg-primary text-primary-contrast'
                : 'border-border bg-surface hover:border-primary/60'"
              @update:model-value="toggleBill(bill._id)"
              @click.stop
            >
              <Checkbox.Indicator class="flex items-center justify-center text-xs font-bold leading-none">
                <span v-if="selectedBillIds.includes(bill._id)"><AppIcon><Checkmark /></AppIcon></span>
              </Checkbox.Indicator>
            </Checkbox.Root>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-xs sm:text-sm text-text">{{ bill.billNumber }}</span>
                <span
                  v-if="tableNames?.[bill._id]"
                  class="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                  data-test="bill-table-badge"
                >
                  {{ tableNames[bill._id] }}
                </span>
              </div>
              <div class="text-xs text-text-muted mt-0.5">
                {{ bill.lines.length }} món · {{ format(bill.total) }}
              </div>
            </div>
            <div class="text-right font-mono shrink-0">
              <div class="font-semibold text-xs sm:text-sm text-primary">{{ format(bill.balanceRemaining) }}</div>
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div v-if="selectedBillIds.length > 0" class="panel-card bg-primary/5 border border-primary/20 p-3 rounded-md">
          <div class="flex justify-between items-center text-xs sm:text-sm">
            <span class="font-medium text-primary">{{ t('pos.split.targetBill') }} ({{ selectedBillIds.length }} hoá đơn)</span>
            <span
              data-test="merged-total"
              class="text-base font-bold text-primary font-mono"
            >{{ format(mergedTotal) }}</span>
          </div>
        </div>
      </div>

      <div class="pt-3 border-t border-border flex justify-end gap-2">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-3 py-1.5 rounded-md cursor-pointer"
          @click="handleClose"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="confirm-merge-btn"
          class="btn btn-primary text-xs px-3.5 py-1.5 rounded-md cursor-pointer"
          :disabled="!canConfirm()"
          @click="handleConfirm"
        >
          <Button.Content>{{ t('pos.split.confirm') }}</Button.Content>
        </Button.Root>
      </div>
    </div>
  </div>
</template>
