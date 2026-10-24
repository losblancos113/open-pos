<script setup lang="ts">
import { ref, computed } from 'vue';
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
  transferDone: [];
}>();

const { t } = useI18n();

const targetTableId = ref<string>('');
const reason = ref<string>('');

const availableTables = computed(() =>
  props.tables.filter((t) => !props.session.tableIds.includes(t._id))
);

const currentTable = computed(() =>
  props.tables.find((t) => props.session.tableIds.includes(t._id))
);

function canConfirm() {
  return !!targetTableId.value;
}

function handleConfirm() {
  emit('transferDone');
  emit('close');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="transfer-table-dialog">
    <div class="dialog-header">
      <h3 class="text-lg font-semibold">{{ t('pos.split.transfer') }}</h3>
    </div>

    <div class="p-4">
      <!-- Current table info -->
      <div v-if="currentTable" class="mb-4 p-3 bg-gray-50 rounded">
        <div class="text-sm text-gray-600">Bàn hiện tại</div>
        <div class="font-semibold">{{ currentTable.name }}</div>
      </div>

      <!-- Select target table -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">Chọn bàn đích</label>
        <select
          data-test="target-table-select"
          v-model="targetTableId"
          class="w-full p-2 border rounded text-sm"
        >
          <option value="" disabled>{{ t('pos.table.backToFloor') }}</option>
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
      <div v-if="otherBills.length > 0" class="mb-4">
        <p class="text-sm font-medium mb-2">Hoá đơn khác trên bàn này:</p>
        <div class="space-y-1">
          <div
            v-for="bill in otherBills"
            :key="bill._id"
            class="text-sm p-2 bg-gray-50 rounded"
          >
            <div class="font-medium">{{ bill.billNumber }}</div>
            <div class="text-xs text-gray-500">{{ format(bill.balanceRemaining) }}</div>
          </div>
        </div>
      </div>

      <!-- Reason -->
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">{{ t('pos.split.reason') }}</label>
        <Input.Root
          data-test="reason-input"
          type="text"
          :placeholder="t('pos.split.reason')"
          :model-value="reason"
          @update:model-value="reason = $event"
          class="w-full"
        />
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
.transfer-table-dialog {
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
