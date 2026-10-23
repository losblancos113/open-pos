<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { TableDoc, TableStatus } from '@/core/order/types';
import type { Money } from '@/core/money';
import { format } from '@/core/money';

const props = withDefaults(
  defineProps<{
    table: TableDoc;
    status?: TableStatus;
    active?: boolean;
    totalAmount?: Money | null;
  }>(),
  {
    status: 'empty',
    active: false,
    totalAmount: null,
  },
);

const emit = defineEmits<{
  (e: 'click'): void;
}>();

const { t } = useI18n();

const statusLabel = computed(() => {
  switch (props.status) {
    case 'occupied':
      return t('pos.table.occupied');
    case 'bill_printed':
      return t('pos.table.billPrinted');
    case 'empty':
    default:
      return t('pos.table.empty');
  }
});

const statusBadgeClass = computed(() => {
  switch (props.status) {
    case 'occupied':
      return 'bg-primary/10 text-primary border-primary/20';
    case 'bill_printed':
      return 'bg-warning/10 text-warning border-warning/20';
    case 'empty':
    default:
      return 'bg-bg text-text-muted border-border';
  }
});

const cardBorderClass = computed(() => {
  if (props.active) {
    return 'border-primary ring-2 ring-primary ring-offset-1';
  }
  switch (props.status) {
    case 'occupied':
      return 'border-primary/80 bg-primary/5 hover:border-primary';
    case 'bill_printed':
      return 'border-warning/80 bg-warning/5 hover:border-warning';
    case 'empty':
    default:
      return 'border-border hover:border-text-muted/40';
  }
});
</script>

<template>
  <Button.Root
    type="button"
    :data-table-id="table._id"
    :data-status="status"
    :data-active="active ? '' : undefined"
    class="w-full text-left p-3.5 rounded-lg cursor-pointer transition-all flex flex-col justify-between gap-3 bg-surface border border-solid shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    :class="cardBorderClass"
    @click="emit('click')"
  >
    <!-- Hàng trên: Mã bàn và nhãn trạng thái -->
    <div class="flex items-center justify-between gap-2 w-full">
      <span class="font-bold text-base text-text tracking-wide">{{ table.code }}</span>
      <span
        class="text-xs px-2 py-0.5 rounded-full font-medium border border-solid"
        :class="statusBadgeClass"
      >
        {{ statusLabel }}
      </span>
    </div>

    <!-- Hàng giữa: Tên bàn và sức chứa -->
    <div class="flex items-center justify-between gap-2 w-full text-xs">
      <span class="font-medium text-text-muted truncate">{{ table.name }}</span>
      <span class="px-1.5 py-0.5 rounded bg-bg text-text-muted border border-border whitespace-nowrap">
        {{ t('pos.table.capacity', { count: table.capacity }) }}
      </span>
    </div>

    <!-- Hàng dưới (tuỳ chọn): Tổng tiền của phiên đang dùng nếu có -->
    <div v-if="totalAmount" class="pt-1 border-t border-border/50 flex items-center justify-end w-full">
      <span
        data-test="table-total"
        class="text-xs font-semibold px-2 py-0.5 rounded"
        :class="status === 'bill_printed' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary'"
      >
        {{ format(totalAmount) }}
      </span>
    </div>
  </Button.Root>
</template>
