<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Button, Input } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import { format } from '@/core/money';
import type { BillDoc, SessionDoc, TableDoc } from '@/core/order/types';

const props = defineProps<{
  session: SessionDoc;
  tables: TableDoc[];
  currentBill: BillDoc;
  otherBills: BillDoc[];
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  /** Emits the full selection payload so the parent can dispatch the transfer. */
  confirmTransfer: [payload: { targetTableId: string; reason?: string | undefined }];
}>();

const { t } = useI18n();

const targetTableId = ref<string>('');
const reason = ref<string>('');

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      targetTableId.value = '';
      reason.value = '';
    }
  }
);

const currentTableIds = computed(() => {
  const ids = new Set<string>();
  if (props.session?.tableIds) {
    for (const tid of props.session.tableIds) {
      ids.add(tid);
      const short = tid.startsWith('table:') ? tid.split(':').pop()! : tid;
      ids.add(short);
      ids.add(`table:${props.session.branchId}:${short}`);
    }
  }
  return ids;
});

const availableTables = computed(() =>
  props.tables.filter((t) => {
    const short = t._id.startsWith('table:') ? t._id.split(':').pop()! : t._id;
    return !currentTableIds.value.has(t._id) && !currentTableIds.value.has(t.code) && !currentTableIds.value.has(short);
  })
);

const currentTable = computed(() =>
  props.tables.find((t) => {
    const short = t._id.startsWith('table:') ? t._id.split(':').pop()! : t._id;
    return currentTableIds.value.has(t._id) || currentTableIds.value.has(t.code) || currentTableIds.value.has(short);
  })
);

function canConfirm() {
  return !!targetTableId.value;
}

function handleConfirm() {
  if (!canConfirm()) return;
  emit('confirmTransfer', { targetTableId: targetTableId.value, reason: reason.value || undefined });
  emit('close');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
    <div class="transfer-table-dialog panel-card max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-border pb-3">
        <h3 class="text-base sm:text-lg font-bold text-text">{{ t('pos.split.transfer') }}</h3>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text cursor-pointer"
          @click="handleClose"
        >
          ✕
        </Button.Root>
      </div>

      <div class="space-y-4">
        <!-- Current table info -->
        <div v-if="currentTable" class="p-3 bg-surface border border-border rounded-md">
          <div class="text-xs text-text-muted">Bàn hiện tại</div>
          <div class="font-bold text-text text-sm sm:text-base mt-0.5">{{ currentTable.name }}</div>
        </div>

        <!-- Select target table -->
        <div>
          <label class="field-label text-xs font-medium text-text-muted">Chọn bàn đích *</label>
          <select
            data-test="target-table-select"
            v-model="targetTableId"
            class="field-input text-xs w-full py-2 px-3 rounded-md bg-surface border border-border font-medium cursor-pointer"
          >
            <option value="" disabled>{{ t('pos.table.selectTargetTable') }}</option>
            <option
              v-for="table in availableTables"
              :key="table._id"
              :value="table._id"
              data-test="table-option"
            >
              {{ table.name }}
            </option>
          </select>
        </div>

        <!-- Other bills on this session -->
        <div v-if="otherBills.length > 0" class="space-y-1.5">
          <p class="text-xs font-medium text-text-muted">Hoá đơn khác trên bàn này:</p>
          <div class="space-y-1">
            <div
              v-for="bill in otherBills"
              :key="bill._id"
              class="text-xs p-2.5 bg-surface border border-border rounded-md flex items-center justify-between"
            >
              <div class="font-medium text-text">{{ bill.billNumber }}</div>
              <div class="font-mono text-text-muted">{{ format(bill.balanceRemaining) }}</div>
            </div>
          </div>
        </div>

        <!-- Reason -->
        <div>
          <label class="field-label text-xs font-medium text-text-muted">{{ t('pos.split.reason') }}</label>
          <Input.Root
            data-test="reason-input"
            type="text"
            :model-value="reason"
            @update:model-value="reason = $event"
            class="w-full"
          >
            <Input.Control
              class="field-input text-xs w-full"
              :placeholder="t('pos.split.reason')"
            />
          </Input.Root>
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
