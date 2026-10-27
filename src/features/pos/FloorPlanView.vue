<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { AreaDoc, TableDoc, TableStatus } from '@/core/order/types';
import type { Money } from '@/core/money';
import type { OrderRepository } from '@/core/order/order-repository';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import TableCard from './TableCard.vue';

const props = withDefaults(
  defineProps<{
    areas?: AreaDoc[];
    tables?: TableDoc[];
    activeTableId?: string | null;
    tableStatuses?: Record<string, TableStatus>;
    tableTotals?: Record<string, Money>;
    orderRepository?: OrderRepository;
    branchId?: string;
  }>(),
  {
    activeTableId: null,
    tableStatuses: () => ({}),
    tableTotals: () => ({}),
    branchId: DEFAULT_BRANCH_ID,
  },
);

const emit = defineEmits<{
  (e: 'select-table', tableId: string): void;
  (e: 'open-table-admin'): void;
}>();

const { t } = useI18n();

const selectedAreaId = ref<string>('all');
const loadedAreas = ref<AreaDoc[]>([]);
const loadedTables = ref<TableDoc[]>([]);

defineExpose({
  loadData,
});

const effectiveAreas = computed(() => props.areas ?? loadedAreas.value);
const effectiveTables = computed(() => props.tables ?? loadedTables.value);

const filteredTables = computed(() => {
  if (selectedAreaId.value === 'all') {
    return effectiveTables.value;
  }
  return effectiveTables.value.filter((table) => table.areaId === selectedAreaId.value);
});

async function loadData() {
  if (props.orderRepository) {
    try {
      const res = await props.orderRepository.getAreasAndTables(props.branchId);
      loadedAreas.value = res.areas;
      loadedTables.value = res.tables;
    } catch {
      // Bỏ qua lỗi kết nối khi tải
    }
  }
}

watch(
  () => props.branchId,
  () => {
    selectedAreaId.value = 'all';
    if (!props.areas || !props.tables) {
      loadData();
    }
  },
);

onMounted(() => {
  if (!props.areas || !props.tables) {
    loadData();
  }
});
</script>

<template>
  <div class="floor-plan-view flex flex-col gap-4 h-full" data-test="floor-plan-view">
    <!-- Bộ lọc khu vực (Area filter tabs) & Quản lý bàn -->
    <div class="area-filter-bar flex items-center justify-between gap-2 overflow-x-auto pb-1">
      <Button.Group
        v-model="selectedAreaId"
        mandatory
        class="inline-flex gap-1 rounded-md bg-bg p-1 border border-border shadow-xs"
        data-test="area-filter-group"
      >
        <Button.Root
          type="button"
          value="all"
          data-area-id="all"
          class="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t('pos.table.allAreas') }}
        </Button.Root>

        <Button.Root
          v-for="area in effectiveAreas"
          :key="area._id"
          type="button"
          :value="area._id"
          :data-area-id="area._id"
          class="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ area.name }}
        </Button.Root>
      </Button.Group>

      <Button.Root
        type="button"
        data-test="manage-tables-btn"
        class="btn btn-ghost text-xs px-2.5 py-1.5 rounded-md hover:bg-surface border border-border text-text-muted hover:text-text shrink-0 flex items-center gap-1.5"
        @click="emit('open-table-admin')"
      >
        <Button.Content>⚙️ {{ t('tableAdmin.title') }}</Button.Content>
      </Button.Root>
    </div>

    <!-- Lưới hiển thị các bàn (Responsive table grid) -->
    <div
      v-if="filteredTables.length > 0"
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto"
      data-test="tables-grid"
    >
      <TableCard
        v-for="table in filteredTables"
        :key="table._id"
        :table="table"
        :status="tableStatuses[table._id] ?? 'empty'"
        :active="activeTableId === table._id"
        :total-amount="tableTotals[table._id] ?? null"
        @click="emit('select-table', table._id)"
      />
    </div>

    <!-- Thông báo khi khu vực không có bàn nào -->
    <div
      v-else
      class="p-8 text-center text-text-muted text-sm my-auto"
      data-test="no-tables-message"
    >
      {{ t('pos.table.noTables') }}
    </div>
  </div>
</template>
