<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Checkbox } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import type { BillDoc } from '@/core/order/types';
import { money, format } from '@/core/money';

const props = defineProps<{
  bills: BillDoc[];
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  /** Emits the full selection payload so the parent can dispatch the merge. */
  confirmMerge: [payload: { billIds: string[] }];
}>();

const { t } = useI18n();

const selectedBillIds = ref<string[]>([]);

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
    if (selectedBillIds.value.length < props.bills.length) {
      selectedBillIds.value.push(billId);
    }
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
  <div v-if="open" class="merge-bills-dialog">
    <div class="dialog-header">
      <h3 class="text-lg font-semibold">{{ t('pos.split.merge') }}</h3>
    </div>

    <div class="p-4">
      <p class="text-sm text-gray-600 mb-4">
        Chọn các hoá đơn để gộp (tối thiểu 2):
      </p>

      <div class="space-y-2 mb-4">
        <div
          v-for="bill in bills"
          :key="bill._id"
          class="flex items-center gap-3 p-3 border rounded"
        >
          <Checkbox.Root
            data-test="bill-checkbox"
            :checked="selectedBillIds.includes(bill._id)"
            @update:checked="toggleBill(bill._id)"
          />
          <div class="flex-1">
            <div class="font-medium">{{ bill.billNumber }}</div>
            <div class="text-xs text-gray-500">
              {{ bill.lines.length }} món · {{ format(bill.total) }}
            </div>
          </div>
          <div class="text-right">
            <div class="font-semibold text-primary">{{ format(bill.balanceRemaining) }}</div>
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div v-if="selectedBillIds.length > 0" class="panel-card">
        <div class="flex justify-between items-center">
          <span class="font-medium">{{ t('pos.split.targetBill') }}</span>
          <span
            data-test="merged-total"
            class="text-lg font-bold text-primary"
          >{{ format(mergedTotal) }}</span>
        </div>
      </div>
    </div>

    <div class="p-4 border-t flex justify-end gap-2">
      <Button.Root @click="handleClose">
        <Button.Content>{{ t('common.close') }}</Button.Content>
      </Button.Root>
      <Button.Root
        :disabled="!canConfirm()"
        @click="handleConfirm"
        :class="{ 'opacity-50': !canConfirm() }"
      >
        <Button.Content>{{ t('pos.split.confirm') }}</Button.Content>
      </Button.Root>
    </div>
  </div>
</template>

<style scoped>
.merge-bills-dialog {
  background: white;
  border-radius: 0.5rem;
  box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  max-width: 36rem;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-header {
  padding: 1rem;
  border-bottom: 1px solid #e5e7eb;
}
</style>
