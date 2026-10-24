<script setup lang="ts">
import { ref, computed } from 'vue';
import { Button, Checkbox, Input } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import type { BillDoc, OrderLineItem } from '@/core/order/types';
import { money, format } from '@/core/money';
import { splitEvenly } from '@/core/order/split-merge';

const props = defineProps<{
  bill: BillDoc;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  splitDone: [];
}>();

const { t } = useI18n();

type SplitMode = 'by-item' | 'evenly' | 'by-seat';
const mode = ref<SplitMode>('by-item');
const selectedLines = ref<string[]>([]);
const evenlyParts = ref<number>(2);

const placedLines = computed<OrderLineItem[]>(() =>
  props.bill.lines.filter((l) => l.status === 'placed')
);

const uniqueSeats = computed<number[]>(() =>
  Array.from(new Set(placedLines.value.map((l) => l.seat ?? 0))).sort((a, b) => a - b)
);

const preview = computed(() => {
  if (mode.value === 'by-item') {
    const selected = placedLines.value.filter((l) => selectedLines.value.includes(l.lineId));
    const remaining = placedLines.value.filter((l) => !selectedLines.value.includes(l.lineId));
    const selectedTotal = selected.reduce((sum, l) => sum + l.unitPriceSnapshot.minor * l.qty, 0);
    const remainingTotal = remaining.reduce((sum, l) => sum + l.unitPriceSnapshot.minor * l.qty, 0);
    return {
      sourceBill: { lines: remaining.length, total: money(remainingTotal, props.bill.balanceRemaining.currency) },
      targetBill: { lines: selected.length, total: money(selectedTotal, props.bill.balanceRemaining.currency) },
    };
  } else if (mode.value === 'evenly') {
    const parts = evenlyParts.value;
    const result = splitEvenly(props.bill, parts, 'actor', 'device', props.bill.sessionId, new Date().toISOString());
    return {
      parts,
      perPart: result.targetBills.map((b) => b.total),
    };
  } else {
    // by-seat preview
    const groups = new Map<number, number>();
    placedLines.value.forEach((l) => {
      const seat = l.seat ?? 0;
      groups.set(seat, (groups.get(seat) ?? 0) + l.unitPriceSnapshot.minor * l.qty);
    });
    return {
      groups: Array.from(groups.entries()).map(([seat, total]) => ({ seat, total: money(total, props.bill.balanceRemaining.currency) })),
    };
  }
});

function toggleLine(lineId: string) {
  const idx = selectedLines.value.indexOf(lineId);
  if (idx >= 0) {
    selectedLines.value.splice(idx, 1);
  } else {
    selectedLines.value.push(lineId);
  }
}

function canConfirm() {
  if (mode.value === 'by-item') {
    return selectedLines.value.length > 0 && selectedLines.value.length < placedLines.value.length;
  } else if (mode.value === 'evenly') {
    return evenlyParts.value >= 2;
  } else {
    return uniqueSeats.value.length >= 2;
  }
}

function handleConfirm() {
  emit('splitDone');
  emit('close');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="split-bill-dialog">
    <div class="dialog-header">
      <h3 class="text-lg font-semibold">{{ t('pos.split.title') }}</h3>
    </div>

    <!-- Tabs -->
    <div class="flex border-b">
      <button
        data-test="tab-by-item"
        class="px-4 py-2 text-sm border-b-2 transition-colors"
        :class="mode === 'by-item' ? 'border-primary text-primary' : 'border-transparent text-gray-500'"
        @click="mode = 'by-item'"
      >
        {{ t('pos.split.byItem') }}
      </button>
      <button
        data-test="tab-evenly"
        class="px-4 py-2 text-sm border-b-2 transition-colors"
        :class="mode === 'evenly' ? 'border-primary text-primary' : 'border-transparent text-gray-500'"
        @click="mode = 'evenly'"
      >
        {{ t('pos.split.evenly') }}
      </button>
      <button
        data-test="tab-by-seat"
        class="px-4 py-2 text-sm border-b-2 transition-colors"
        :class="mode === 'by-seat' ? 'border-primary text-primary' : 'border-transparent text-gray-500'"
        @click="mode = 'by-seat'"
      >
        {{ t('pos.split.bySeat') }}
      </button>
    </div>

    <!-- By Item Mode -->
    <div v-show="mode === 'by-item'" class="p-4">
      <div class="space-y-2 mb-4">
        <div
          v-for="line in placedLines"
          :key="line.lineId"
          class="flex items-center gap-2 p-2 border rounded"
        >
          <Checkbox.Root
            data-test="line-checkbox"
            :checked="selectedLines.includes(line.lineId)"
            @update:checked="toggleLine(line.lineId)"
          />
          <div class="flex-1">
            <div class="font-medium">{{ line.nameSnapshot.vi }}</div>
            <div class="text-sm text-gray-500">
              x{{ line.qty }} — {{ format(line.unitPriceSnapshot) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Preview -->
      <div class="grid grid-cols-2 gap-4 mt-4">
        <div class="panel-card">
          <h4 class="font-medium mb-2">{{ t('pos.split.sourceBill') }}</h4>
          <div class="text-sm">
            <div>{{ preview.sourceBill?.lines ?? 0 }} dòng</div>
            <div class="font-semibold">{{ format(preview.sourceBill?.total ?? money(0, bill.balanceRemaining.currency)) }}</div>
          </div>
        </div>
        <div class="panel-card">
          <h4 class="font-medium mb-2">{{ t('pos.split.targetBill') }}</h4>
          <div class="text-sm">
            <div>{{ preview.targetBill?.lines ?? 0 }} dòng</div>
            <div class="font-semibold">{{ format(preview.targetBill?.total ?? money(0, bill.balanceRemaining.currency)) }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Evenly Mode -->
    <div v-show="mode === 'evenly'" class="p-4">
      <div class="mb-4">
        <label class="block text-sm font-medium mb-2">{{ t('pos.split.parts') }}</label>
        <Input.Root
          data-test="evenly-parts-input"
          type="number"
          :min="2"
          :max="placedLines.length"
          :model-value="String(evenlyParts)"
          @update:model-value="evenlyParts = Math.max(2, Number($event) || 2)"
          class="w-32"
        />
      </div>

      <div class="panel-card mt-4">
        <h4 class="font-medium mb-2">Preview</h4>
        <div class="space-y-1 text-sm">
          <div v-for="(part, idx) in preview.perPart" :key="idx">
            Phần {{ idx + 1 }}: {{ format(part) }}
          </div>
        </div>
      </div>
    </div>

    <!-- By Seat Mode -->
    <div v-show="mode === 'by-seat'" class="p-4">
      <div class="space-y-2">
        <div
          v-for="seat in uniqueSeats"
          :key="seat"
          data-test="seat-group"
          class="panel-card"
        >
          <div class="font-medium mb-1">Ghế {{ seat }}</div>
          <div class="text-sm text-gray-600">
            {{ format(preview.groups?.find((g) => g.seat === seat)?.total ?? money(0, bill.balanceRemaining.currency)) }}
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
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
.split-bill-dialog {
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
