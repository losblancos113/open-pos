<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { Checkmark, Close } from '@vicons/ionicons5';
import { ref, computed } from 'vue';
import { Button, Checkbox, Input } from '@vuetify/v0';
import { useI18n } from 'vue-i18n';
import type { BillDoc, OrderLineItem } from '@/core/order/types';
import { money, format } from '@/core/money';
import { splitEvenly, splitByItems, splitBySeat } from '@/core/order/split-merge';

const props = defineProps<{
  bill: BillDoc;
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  /** Emits the full selection payload so the parent can dispatch the operation. */
  confirmSplit: [payload: SplitPayload];
}>();

interface SplitPayload {
  mode: 'by-item' | 'evenly' | 'by-seat';
  /** For by-item: lineIds to move to the target bill. Undefined when mode is 'evenly' or 'by-seat'. */
  lineIds?: string[] | undefined;
  /** For evenly: number of equal parts. Undefined when mode is 'by-item' or 'by-seat'. */
  parts?: number | undefined;
}

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
  if (!canConfirm()) return;
  emit('confirmSplit', {
    mode: mode.value,
    lineIds: mode.value === 'by-item' ? [...selectedLines.value] : undefined,
    parts: mode.value === 'evenly' ? evenlyParts.value : undefined,
  });
  emit('close');
}

function handleClose() {
  emit('close');
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
    <div class="split-bill-dialog panel-card max-w-xl w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b border-border pb-3">
        <h3 class="text-base sm:text-lg font-bold text-text">{{ t('pos.split.title') }}</h3>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text cursor-pointer"
          @click="handleClose"
        >
          <AppIcon><Close /></AppIcon>
        </Button.Root>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-border">
        <button
          data-test="tab-by-item"
          class="px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer"
          :class="mode === 'by-item' ? 'border-primary text-primary font-bold' : 'border-transparent text-text-muted hover:text-text'"
          @click="mode = 'by-item'"
        >
          {{ t('pos.split.byItem') }}
        </button>
        <button
          data-test="tab-evenly"
          class="px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer"
          :class="mode === 'evenly' ? 'border-primary text-primary font-bold' : 'border-transparent text-text-muted hover:text-text'"
          @click="mode = 'evenly'"
        >
          {{ t('pos.split.evenly') }}
        </button>
        <button
          data-test="tab-by-seat"
          class="px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors cursor-pointer"
          :class="mode === 'by-seat' ? 'border-primary text-primary font-bold' : 'border-transparent text-text-muted hover:text-text'"
          @click="mode = 'by-seat'"
        >
          {{ t('pos.split.bySeat') }}
        </button>
      </div>

      <!-- By Item Mode -->
      <div v-show="mode === 'by-item'" class="space-y-4">
        <div class="space-y-2 mb-4 max-h-60 overflow-y-auto pr-1">
          <div
            v-for="line in placedLines"
            :key="line.lineId"
            role="checkbox"
            :aria-checked="selectedLines.includes(line.lineId)"
            class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all select-none"
            :class="selectedLines.includes(line.lineId)
              ? 'border-primary bg-primary/5 shadow-xs'
              : 'border-border bg-surface hover:border-primary/40 hover:bg-surface/80'"
            @click="toggleLine(line.lineId)"
          >
            <Checkbox.Root
              data-test="line-checkbox"
              :model-value="selectedLines.includes(line.lineId)"
              class="w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-all cursor-pointer"
              :class="selectedLines.includes(line.lineId)
                ? 'border-primary bg-primary text-primary-contrast'
                : 'border-border bg-surface hover:border-primary/60'"
              @update:model-value="toggleLine(line.lineId)"
              @click.stop
            >
              <Checkbox.Indicator class="flex items-center justify-center text-xs font-bold leading-none">
                <span v-if="selectedLines.includes(line.lineId)"><AppIcon><Checkmark /></AppIcon></span>
              </Checkbox.Indicator>
            </Checkbox.Root>
            <div class="flex-1 min-w-0">
              <div class="font-medium text-xs sm:text-sm text-text">{{ line.nameSnapshot.vi }}</div>
              <div class="text-xs text-text-muted mt-0.5">
                x{{ line.qty }} — {{ format(line.unitPriceSnapshot) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Preview -->
        <div class="grid grid-cols-2 gap-3 pt-2">
          <div class="panel-card bg-surface p-3 border border-border rounded-md">
            <h4 class="text-xs font-semibold text-text-muted mb-1">{{ t('pos.split.sourceBill') }}</h4>
            <div class="text-xs">
              <div>{{ preview.sourceBill?.lines ?? 0 }} dòng</div>
              <div class="font-bold text-sm text-text font-mono mt-0.5">{{ format(preview.sourceBill?.total ?? money(0, bill.balanceRemaining.currency)) }}</div>
            </div>
          </div>
          <div class="panel-card bg-primary/5 p-3 border border-primary/20 rounded-md">
            <h4 class="text-xs font-semibold text-primary mb-1">{{ t('pos.split.targetBill') }}</h4>
            <div class="text-xs">
              <div>{{ preview.targetBill?.lines ?? 0 }} dòng</div>
              <div class="font-bold text-sm text-primary font-mono mt-0.5">{{ format(preview.targetBill?.total ?? money(0, bill.balanceRemaining.currency)) }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Evenly Mode -->
      <div v-show="mode === 'evenly'" class="space-y-4">
        <div>
          <label class="field-label text-xs font-medium text-text-muted mb-1">{{ t('pos.split.parts') }}</label>
          <Input.Root
            data-test="evenly-parts-input"
            type="number"
            :min="2"
            :max="placedLines.length"
            :model-value="String(evenlyParts)"
            @update:model-value="evenlyParts = Math.max(2, Number($event) || 2)"
            class="w-36"
          >
            <Input.Control
              class="field-input text-xs"
              :placeholder="t('pos.split.parts')"
            />
          </Input.Root>
        </div>

        <div class="panel-card p-3 border border-border rounded-md">
          <h4 class="text-xs font-semibold text-text-muted mb-2">Xem trước các phần</h4>
          <div class="space-y-1 text-xs">
            <div v-for="(part, idx) in preview.perPart" :key="idx" class="flex justify-between py-1 border-b border-border/50 last:border-b-0">
              <span class="text-text-muted">Phần {{ idx + 1 }}:</span>
              <span class="font-mono font-bold text-text">{{ format(part) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- By Seat Mode -->
      <div v-show="mode === 'by-seat'" class="space-y-4">
        <div class="space-y-2">
          <div
            v-for="seat in uniqueSeats"
            :key="seat"
            data-test="seat-group"
            class="panel-card p-3 border border-border rounded-md flex items-center justify-between"
          >
            <div class="font-semibold text-xs text-text">Ghế {{ seat }}</div>
            <div class="font-mono font-bold text-xs text-primary">
              {{ format(preview.groups?.find((g) => g.seat === seat)?.total ?? money(0, bill.balanceRemaining.currency)) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
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
