<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input, Select } from '@vuetify/v0';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { areaDocId, tableDocId } from '@/core/db/ids';
import type { OrderRepository } from '@/core/order/order-repository';
import type { AreaDoc, TableDoc } from '@/core/order/types';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    branchId?: string;
    branchName?: string;
    orderRepo?: OrderRepository | null;
  }>(),
  {
    open: false,
    branchId: DEFAULT_BRANCH_ID,
    branchName: '',
    orderRepo: null,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'tables-updated'): void;
}>();

const { t } = useI18n();

type Tab = 'areas' | 'tables' | 'batch';
const activeTab = ref<Tab>('areas');

const areas = ref<AreaDoc[]>([]);
const tables = ref<TableDoc[]>([]);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

// Search & Filter
const searchQuery = ref('');
const filterAreaId = ref<string>('all');

// Area Form State
const isAreaFormOpen = ref(false);
const editingAreaId = ref<string | null>(null);
const areaName = ref('');
const areaSlug = ref('');
const areaSortOrder = ref<string>('1');

// Table Form State
const isTableFormOpen = ref(false);
const editingTableId = ref<string | null>(null);
const tableCode = ref('');
const tableName = ref('');
const tableAreaId = ref('');
const tableCapacity = ref<string>('4');
const tableShape = ref<'square' | 'round' | 'rectangle'>('square');
const tableSortOrder = ref<string>('1');

// Batch Generator State
const batchAreaId = ref('');
const batchPrefix = ref('B');
const batchStartIndex = ref<string>('1');
const batchCount = ref<string>('10');
const batchCapacity = ref<string>('4');
const batchShape = ref<'square' | 'round' | 'rectangle'>('square');

function clearMessages() {
  errorMessage.value = null;
  successMessage.value = null;
}

// Compute table count per area
const tableCountByArea = computed(() => {
  const counts = new Map<string, number>();
  for (const table of tables.value) {
    counts.set(table.areaId, (counts.get(table.areaId) ?? 0) + 1);
  }
  return counts;
});

// Area map for table display
const areaMap = computed(() => {
  const map = new Map<string, AreaDoc>();
  for (const area of areas.value) {
    map.set(area._id, area);
    const shortId = area._id.split(':').pop();
    if (shortId) map.set(shortId, area);
  }
  return map;
});

// Filtered tables for list
const filteredTables = computed(() => {
  let list = tables.value;
  if (filterAreaId.value !== 'all') {
    list = list.filter(
      (t) =>
        t.areaId === filterAreaId.value ||
        t.areaId.endsWith(`:${filterAreaId.value}`) ||
        filterAreaId.value.endsWith(`:${t.areaId}`),
    );
  }
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (t) =>
        t.code.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q),
    );
  }
  return list;
});

// Load areas and tables from repo
async function loadData() {
  if (!props.orderRepo) return;
  isLoading.value = true;
  clearMessages();
  try {
    const res = await props.orderRepo.getAreasAndTables(props.branchId);
    areas.value = res.areas;
    tables.value = res.tables;
    if (areas.value.length > 0 && !batchAreaId.value) {
      const firstArea = areas.value[0];
      if (firstArea) {
        batchAreaId.value = firstArea._id;
      }
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.open, props.branchId],
  ([isOpen]) => {
    if (isOpen) {
      loadData();
      resetAreaForm();
      resetTableForm();
    }
  },
  { immediate: true },
);

function resetAreaForm() {
  isAreaFormOpen.value = false;
  editingAreaId.value = null;
  areaName.value = '';
  areaSlug.value = '';
  areaSortOrder.value = String((areas.value.length + 1) * 10);
}

function openAddArea() {
  clearMessages();
  resetAreaForm();
  isAreaFormOpen.value = true;
}

function openEditArea(area: AreaDoc) {
  clearMessages();
  editingAreaId.value = area._id;
  areaName.value = area.name;
  areaSlug.value = area._id.split(':').pop() ?? '';
  areaSortOrder.value = String(area.sortOrder ?? 1);
  isAreaFormOpen.value = true;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `item-${Date.now()}`;
}

async function handleSaveArea() {
  clearMessages();
  if (!props.orderRepo) return;
  const name = areaName.value.trim();
  if (!name) {
    errorMessage.value = t('tableAdmin.area.namePlaceholder');
    return;
  }

  const slug = areaSlug.value.trim() ? areaSlug.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : generateSlug(name);
  const docId = editingAreaId.value ?? areaDocId(props.branchId, slug);

  try {
    const doc: AreaDoc = {
      _id: docId,
      branchId: props.branchId,
      name,
      sortOrder: Number(areaSortOrder.value) || 1,
      createdAt: new Date().toISOString(),
    };
    await props.orderRepo.saveArea(doc);
    successMessage.value = t('tableAdmin.messages.areaSaved');
    resetAreaForm();
    await loadData();
    emit('tables-updated');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

async function handleDeleteArea(area: AreaDoc) {
  clearMessages();
  if (!props.orderRepo) return;
  const count = tableCountByArea.value.get(area._id) ?? 0;
  if (count > 0) {
    errorMessage.value = t('tableAdmin.area.cannotDeleteWithTables', { count });
    return;
  }

  if (!window.confirm(t('tableAdmin.area.confirmDelete', { name: area.name }))) {
    return;
  }

  try {
    const slug = area._id.split(':').pop() ?? area._id;
    await props.orderRepo.deleteArea(props.branchId, slug);
    successMessage.value = t('tableAdmin.messages.areaDeleted');
    await loadData();
    emit('tables-updated');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

function resetTableForm() {
  isTableFormOpen.value = false;
  editingTableId.value = null;
  tableCode.value = '';
  tableName.value = '';
  tableAreaId.value = areas.value[0]?._id ?? '';
  tableCapacity.value = '4';
  tableShape.value = 'square';
  tableSortOrder.value = String((tables.value.length + 1) * 10);
}

function openAddTable() {
  clearMessages();
  if (areas.value.length === 0) {
    errorMessage.value = t('tableAdmin.table.noAreaAlert');
    activeTab.value = 'areas';
    return;
  }
  resetTableForm();
  if (filterAreaId.value !== 'all') {
    tableAreaId.value = filterAreaId.value;
  }
  isTableFormOpen.value = true;
}

function openEditTable(table: TableDoc) {
  clearMessages();
  editingTableId.value = table._id;
  tableCode.value = table.code;
  tableName.value = table.name;
  tableAreaId.value = table.areaId;
  tableCapacity.value = String(table.capacity ?? 4);
  tableShape.value = table.shape ?? 'square';
  tableSortOrder.value = String(table.sortOrder ?? 1);
  isTableFormOpen.value = true;
}

async function handleSaveTable() {
  clearMessages();
  if (!props.orderRepo) return;
  const code = tableCode.value.trim().toUpperCase();
  const name = tableName.value.trim();
  const targetArea = tableAreaId.value;

  if (!code || !name) {
    errorMessage.value = t('tableAdmin.table.codePlaceholder');
    return;
  }
  if (!targetArea) {
    errorMessage.value = t('tableAdmin.table.selectArea');
    return;
  }

  // Check code uniqueness within branch (excluding currently edited table)
  const isDuplicate = tables.value.some(
    (t) => t.code.toUpperCase() === code && t._id !== editingTableId.value,
  );
  if (isDuplicate) {
    errorMessage.value = t('tableAdmin.table.duplicateCode', { code });
    return;
  }

  const slug = code.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const docId = editingTableId.value ?? tableDocId(props.branchId, slug || `t-${Date.now()}`);

  try {
    const doc: TableDoc = {
      _id: docId,
      branchId: props.branchId,
      areaId: targetArea,
      code,
      name,
      capacity: Math.max(1, Number(tableCapacity.value) || 4),
      shape: tableShape.value,
      sortOrder: Number(tableSortOrder.value) || 1,
      createdAt: new Date().toISOString(),
    };
    await props.orderRepo.saveTable(doc);
    successMessage.value = t('tableAdmin.messages.tableSaved');
    resetTableForm();
    await loadData();
    emit('tables-updated');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

async function handleDeleteTable(table: TableDoc) {
  clearMessages();
  if (!props.orderRepo) return;
  if (!window.confirm(t('tableAdmin.table.confirmDelete', { name: table.name, code: table.code }))) {
    return;
  }

  try {
    const slug = table._id.split(':').pop() ?? table._id;
    await props.orderRepo.deleteTable(props.branchId, slug);
    successMessage.value = t('tableAdmin.messages.tableDeleted');
    await loadData();
    emit('tables-updated');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}

// Batch Preview list
const batchPreviewCodes = computed(() => {
  const prefix = batchPrefix.value.trim().toUpperCase();
  const start = Math.max(1, Number(batchStartIndex.value) || 1);
  const count = Math.min(50, Math.max(1, Number(batchCount.value) || 1));
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = start + i;
    const numStr = num < 10 ? `0${num}` : String(num);
    list.push(`${prefix}${numStr}`);
  }
  return list;
});

async function handleBatchGenerate() {
  clearMessages();
  if (!props.orderRepo) return;
  if (!batchAreaId.value) {
    errorMessage.value = t('tableAdmin.table.selectArea');
    return;
  }
  const codes = batchPreviewCodes.value;
  if (codes.length === 0) return;

  // Check if any code conflicts
  const existingCodes = new Set(tables.value.map((t) => t.code.toUpperCase()));
  const conflicts = codes.filter((c) => existingCodes.has(c));
  if (conflicts.length > 0) {
    errorMessage.value = t('tableAdmin.table.duplicateCode', { code: conflicts.join(', ') });
    return;
  }

  try {
    let createdCount = 0;
    const baseSort = (tables.value.length + 1) * 10;
    for (let i = 0; i < codes.length; i++) {
      const code = codes[i]!;
      const slug = code.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const doc: TableDoc = {
        _id: tableDocId(props.branchId, slug),
        branchId: props.branchId,
        areaId: batchAreaId.value,
        code,
        name: `${t('pos.receipt.table')} ${code}`,
        capacity: Math.max(1, Number(batchCapacity.value) || 4),
        shape: batchShape.value,
        sortOrder: baseSort + i * 5,
        createdAt: new Date().toISOString(),
      };
      await props.orderRepo.saveTable(doc);
      createdCount++;
    }
    successMessage.value = t('tableAdmin.batch.success', { count: createdCount });
    await loadData();
    emit('tables-updated');
    activeTab.value = 'tables';
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <Dialog.Root :model-value="open" @update:model-value="emit('close')">
    <Dialog.Content
      class="panel-card max-w-4xl w-full p-6 space-y-4 max-h-[90vh] flex flex-col overflow-hidden m-auto"
      data-test="table-admin-modal"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border pb-3 shrink-0">
        <div>
          <Dialog.Title class="text-lg font-bold text-text flex items-center gap-2">
            <span>🪑</span>
            <span>{{ t('tableAdmin.title') }}</span>
          </Dialog.Title>
          <div class="text-xs text-text-muted mt-0.5">
            {{ t('tableAdmin.currentBranch', { name: branchName || branchId }) }}
          </div>
        </div>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-2.5 py-1.5 rounded-md hover:bg-surface"
          data-test="close-modal-btn"
          @click="emit('close')"
        >
          <Button.Content>✕</Button.Content>
        </Button.Root>
      </div>

      <!-- Feedback Messages -->
      <div
        v-if="errorMessage"
        class="error-text p-2.5 bg-danger/10 border border-danger/30 rounded-md text-xs shrink-0 flex items-center justify-between"
        role="alert"
        data-test="table-admin-error"
      >
        <span>{{ errorMessage }}</span>
        <button type="button" class="text-danger hover:underline font-bold" @click="errorMessage = null">✕</button>
      </div>
      <div
        v-if="successMessage"
        class="p-2.5 bg-success/10 border border-success/30 text-success rounded-md text-xs shrink-0 flex items-center justify-between"
        role="status"
        data-test="table-admin-success"
      >
        <span>{{ successMessage }}</span>
        <button type="button" class="text-success hover:underline font-bold" @click="successMessage = null">✕</button>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex items-center gap-2 border-b border-border pb-2 shrink-0">
        <Button.Root
          type="button"
          data-test="tab-areas"
          class="btn btn-ghost text-xs px-3 py-1.5 rounded-md transition-colors"
          :class="activeTab === 'areas' ? 'bg-primary text-primary-contrast font-medium' : 'text-text-muted hover:text-text'"
          @click="activeTab = 'areas'"
        >
          <Button.Content>🏢 {{ t('tableAdmin.tabs.areas') }} ({{ areas.length }})</Button.Content>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="tab-tables"
          class="btn btn-ghost text-xs px-3 py-1.5 rounded-md transition-colors"
          :class="activeTab === 'tables' ? 'bg-primary text-primary-contrast font-medium' : 'text-text-muted hover:text-text'"
          @click="activeTab = 'tables'"
        >
          <Button.Content>🪑 {{ t('tableAdmin.tabs.tables') }} ({{ tables.length }})</Button.Content>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="tab-batch"
          class="btn btn-ghost text-xs px-3 py-1.5 rounded-md transition-colors"
          :class="activeTab === 'batch' ? 'bg-primary text-primary-contrast font-medium' : 'text-text-muted hover:text-text'"
          @click="activeTab = 'batch'"
        >
          <Button.Content>⚡ {{ t('tableAdmin.tabs.batch') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- Tab Content (Scrollable) -->
      <div class="flex-1 overflow-y-auto space-y-4 pr-1">

        <!-- ==================== TAB 1: AREAS ==================== -->
        <div v-if="activeTab === 'areas'" class="space-y-4" data-test="areas-tab-content">
          <!-- Toolbar -->
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-semibold text-text">{{ t('tableAdmin.area.title') }}</h3>
            <Button.Root
              type="button"
              data-test="add-area-btn"
              class="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              @click="openAddArea"
            >
              <Button.Content>+ {{ t('tableAdmin.area.add') }}</Button.Content>
            </Button.Root>
          </div>

          <!-- Add / Edit Area Form Panel -->
          <div
            v-if="isAreaFormOpen"
            class="p-4 border border-border rounded-lg bg-surface/50 space-y-3"
            data-test="area-form"
          >
            <h4 class="text-xs font-bold uppercase text-primary">
              {{ editingAreaId ? t('tableAdmin.area.edit') : t('tableAdmin.area.add') }}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.area.name') }} *</label>
                <Input.Root v-model="areaName" data-test="area-name-input">
                  <Input.Control
                    class="field-input w-full text-xs"
                    :placeholder="t('tableAdmin.area.namePlaceholder')"
                  />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.area.slug') }}</label>
                <Input.Root v-model="areaSlug" data-test="area-slug-input">
                  <Input.Control
                    class="field-input w-full text-xs"
                    :placeholder="t('tableAdmin.area.slugPlaceholder')"
                    :disabled="Boolean(editingAreaId)"
                  />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.area.sortOrder') }}</label>
                <Input.Root v-model="areaSortOrder" type="number" data-test="area-sort-order-input">
                  <Input.Control class="field-input w-full text-xs" type="number" />
                </Input.Root>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-1">
              <Button.Root
                type="button"
                data-test="cancel-area-btn"
                class="btn btn-ghost text-xs px-3 py-1.5"
                @click="resetAreaForm"
              >
                <Button.Content>{{ t('tableAdmin.actions.cancel') }}</Button.Content>
              </Button.Root>
              <Button.Root
                type="button"
                data-test="save-area-btn"
                class="btn btn-primary text-xs px-4 py-1.5"
                @click="handleSaveArea"
              >
                <Button.Content>{{ t('tableAdmin.actions.save') }}</Button.Content>
              </Button.Root>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="areas.length === 0"
            class="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-lg"
            data-test="empty-areas-msg"
          >
            {{ t('tableAdmin.area.empty') }}
          </div>

          <!-- Area List Table -->
          <div v-else class="border border-border rounded-lg overflow-hidden" data-test="area-list">
            <table class="w-full text-left text-xs">
              <thead class="bg-surface/80 border-b border-border text-text-muted font-medium">
                <tr>
                  <th class="p-3">{{ t('tableAdmin.area.name') }}</th>
                  <th class="p-3">{{ t('tableAdmin.area.slug') }}</th>
                  <th class="p-3 text-center">{{ t('tableAdmin.area.sortOrder') }}</th>
                  <th class="p-3 text-center">{{ t('tableAdmin.area.tableCount') }}</th>
                  <th class="p-3 text-right"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="area in areas"
                  :key="area._id"
                  class="hover:bg-surface/40 transition-colors"
                  data-test="area-row"
                >
                  <td class="p-3 font-medium text-text">{{ area.name }}</td>
                  <td class="p-3 font-mono text-[11px] text-text-muted">{{ area._id }}</td>
                  <td class="p-3 text-center text-text-muted">{{ area.sortOrder }}</td>
                  <td class="p-3 text-center">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                      {{ tableCountByArea.get(area._id) ?? 0 }}
                    </span>
                  </td>
                  <td class="p-3 text-right space-x-1">
                    <Button.Root
                      type="button"
                      data-test="edit-area-btn"
                      class="btn btn-ghost text-xs px-2 py-1"
                      @click="openEditArea(area)"
                    >
                      <Button.Content>{{ t('tableAdmin.actions.edit') }}</Button.Content>
                    </Button.Root>
                    <Button.Root
                      type="button"
                      data-test="delete-area-btn"
                      class="btn btn-danger text-xs px-2 py-1"
                      @click="handleDeleteArea(area)"
                    >
                      <Button.Content>{{ t('tableAdmin.actions.delete') }}</Button.Content>
                    </Button.Root>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ==================== TAB 2: TABLES ==================== -->
        <div v-if="activeTab === 'tables'" class="space-y-4" data-test="tables-tab-content">
          <!-- Filters & Actions -->
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 flex-1 min-w-[280px]">
              <!-- Filter Area -->
              <select
                v-model="filterAreaId"
                data-test="table-filter-area"
                class="field-input text-xs py-1.5 px-2.5 rounded-md min-w-[140px]"
              >
                <option value="all">{{ t('tableAdmin.table.allAreas') }}</option>
                <option v-for="area in areas" :key="area._id" :value="area._id">
                  {{ area.name }}
                </option>
              </select>

              <!-- Search input -->
              <Input.Root v-model="searchQuery" data-test="table-search-input" class="flex-1">
                <Input.Control
                  class="field-input w-full text-xs"
                  :placeholder="t('tableAdmin.table.searchPlaceholder')"
                />
              </Input.Root>
            </div>

            <Button.Root
              type="button"
              data-test="add-table-btn"
              class="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
              @click="openAddTable"
            >
              <Button.Content>+ {{ t('tableAdmin.table.add') }}</Button.Content>
            </Button.Root>
          </div>

          <!-- Add / Edit Table Form Panel -->
          <div
            v-if="isTableFormOpen"
            class="p-4 border border-border rounded-lg bg-surface/50 space-y-3"
            data-test="table-form"
          >
            <h4 class="text-xs font-bold uppercase text-primary">
              {{ editingTableId ? t('tableAdmin.table.edit') : t('tableAdmin.table.add') }}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.area') }} *</label>
                <select
                  v-model="tableAreaId"
                  data-test="table-form-area-select"
                  class="field-input w-full text-xs py-2 px-2.5 rounded-md"
                >
                  <option v-for="area in areas" :key="area._id" :value="area._id">
                    {{ area.name }}
                  </option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.code') }} *</label>
                <Input.Root v-model="tableCode" data-test="table-code-input">
                  <Input.Control
                    class="field-input w-full text-xs uppercase"
                    :placeholder="t('tableAdmin.table.codePlaceholder')"
                  />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.name') }} *</label>
                <Input.Root v-model="tableName" data-test="table-name-input">
                  <Input.Control
                    class="field-input w-full text-xs"
                    :placeholder="t('tableAdmin.table.namePlaceholder')"
                  />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.capacity') }}</label>
                <Input.Root v-model="tableCapacity" type="number" data-test="table-capacity-input">
                  <Input.Control class="field-input w-full text-xs" type="number" min="1" max="50" />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.shape') }}</label>
                <select
                  v-model="tableShape"
                  data-test="table-shape-select"
                  class="field-input w-full text-xs py-2 px-2.5 rounded-md"
                >
                  <option value="square">{{ t('tableAdmin.table.shapes.square') }}</option>
                  <option value="round">{{ t('tableAdmin.table.shapes.round') }}</option>
                  <option value="rectangle">{{ t('tableAdmin.table.shapes.rectangle') }}</option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.table.sortOrder') }}</label>
                <Input.Root v-model="tableSortOrder" type="number" data-test="table-sort-order-input">
                  <Input.Control class="field-input w-full text-xs" type="number" />
                </Input.Root>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 pt-1">
              <Button.Root
                type="button"
                data-test="cancel-table-btn"
                class="btn btn-ghost text-xs px-3 py-1.5"
                @click="resetTableForm"
              >
                <Button.Content>{{ t('tableAdmin.actions.cancel') }}</Button.Content>
              </Button.Root>
              <Button.Root
                type="button"
                data-test="save-table-btn"
                class="btn btn-primary text-xs px-4 py-1.5"
                @click="handleSaveTable"
              >
                <Button.Content>{{ t('tableAdmin.actions.save') }}</Button.Content>
              </Button.Root>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-if="filteredTables.length === 0"
            class="p-8 text-center text-text-muted text-xs border border-dashed border-border rounded-lg"
            data-test="empty-tables-msg"
          >
            {{ t('tableAdmin.table.empty') }}
          </div>

          <!-- Tables List Table -->
          <div v-else class="border border-border rounded-lg overflow-hidden" data-test="table-list">
            <table class="w-full text-left text-xs">
              <thead class="bg-surface/80 border-b border-border text-text-muted font-medium">
                <tr>
                  <th class="p-3">{{ t('tableAdmin.table.code') }}</th>
                  <th class="p-3">{{ t('tableAdmin.table.name') }}</th>
                  <th class="p-3">{{ t('tableAdmin.table.area') }}</th>
                  <th class="p-3 text-center">{{ t('tableAdmin.table.capacity') }}</th>
                  <th class="p-3 text-center">{{ t('tableAdmin.table.shape') }}</th>
                  <th class="p-3 text-center">{{ t('tableAdmin.table.sortOrder') }}</th>
                  <th class="p-3 text-right"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="table in filteredTables"
                  :key="table._id"
                  class="hover:bg-surface/40 transition-colors"
                  data-test="table-row"
                >
                  <td class="p-3 font-bold text-text">{{ table.code }}</td>
                  <td class="p-3 font-medium text-text">{{ table.name }}</td>
                  <td class="p-3 text-text-muted">
                    {{ areaMap.get(table.areaId)?.name ?? table.areaId }}
                  </td>
                  <td class="p-3 text-center text-text-muted">{{ table.capacity ?? 4 }}</td>
                  <td class="p-3 text-center">
                    <span class="text-[11px] px-2 py-0.5 rounded border border-border bg-surface">
                      {{ t(`tableAdmin.table.shapes.${table.shape || 'square'}`) }}
                    </span>
                  </td>
                  <td class="p-3 text-center text-text-muted">{{ table.sortOrder }}</td>
                  <td class="p-3 text-right space-x-1">
                    <Button.Root
                      type="button"
                      data-test="edit-table-btn"
                      class="btn btn-ghost text-xs px-2 py-1"
                      @click="openEditTable(table)"
                    >
                      <Button.Content>{{ t('tableAdmin.actions.edit') }}</Button.Content>
                    </Button.Root>
                    <Button.Root
                      type="button"
                      data-test="delete-table-btn"
                      class="btn btn-danger text-xs px-2 py-1"
                      @click="handleDeleteTable(table)"
                    >
                      <Button.Content>{{ t('tableAdmin.actions.delete') }}</Button.Content>
                    </Button.Root>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ==================== TAB 3: BATCH GENERATOR ==================== -->
        <div v-if="activeTab === 'batch'" class="space-y-4" data-test="batch-tab-content">
          <div class="border-b border-border pb-2">
            <h3 class="text-sm font-semibold text-text">{{ t('tableAdmin.batch.title') }}</h3>
            <p class="text-xs text-text-muted mt-0.5">{{ t('tableAdmin.batch.description') }}</p>
          </div>

          <div
            v-if="areas.length === 0"
            class="p-6 text-center text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg"
          >
            {{ t('tableAdmin.table.noAreaAlert') }}
          </div>

          <div v-else class="space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.targetArea') }} *</label>
                <select
                  v-model="batchAreaId"
                  data-test="batch-area-select"
                  class="field-input w-full text-xs py-2 px-2.5 rounded-md"
                >
                  <option v-for="area in areas" :key="area._id" :value="area._id">
                    {{ area.name }}
                  </option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.prefix') }} *</label>
                <Input.Root v-model="batchPrefix" data-test="batch-prefix-input">
                  <Input.Control
                    class="field-input w-full text-xs uppercase"
                    :placeholder="t('tableAdmin.batch.prefixPlaceholder')"
                  />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.startIndex') }}</label>
                <Input.Root v-model="batchStartIndex" type="number" data-test="batch-start-index-input">
                  <Input.Control class="field-input w-full text-xs" type="number" min="1" />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.count') }}</label>
                <Input.Root v-model="batchCount" type="number" data-test="batch-count-input">
                  <Input.Control class="field-input w-full text-xs" type="number" min="1" max="50" />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.capacity') }}</label>
                <Input.Root v-model="batchCapacity" type="number" data-test="batch-capacity-input">
                  <Input.Control class="field-input w-full text-xs" type="number" min="1" max="50" />
                </Input.Root>
              </div>

              <div class="space-y-1">
                <label class="field-label text-xs font-medium">{{ t('tableAdmin.batch.shape') }}</label>
                <select
                  v-model="batchShape"
                  data-test="batch-shape-select"
                  class="field-input w-full text-xs py-2 px-2.5 rounded-md"
                >
                  <option value="square">{{ t('tableAdmin.table.shapes.square') }}</option>
                  <option value="round">{{ t('tableAdmin.table.shapes.round') }}</option>
                  <option value="rectangle">{{ t('tableAdmin.table.shapes.rectangle') }}</option>
                </select>
              </div>
            </div>

            <!-- Preview -->
            <div class="p-3 border border-border rounded-lg bg-surface/50 space-y-2">
              <div class="text-xs font-semibold text-text">
                {{ t('tableAdmin.batch.preview', { count: batchPreviewCodes.length }) }}:
              </div>
              <div class="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto" data-test="batch-preview-chips">
                <span
                  v-for="code in batchPreviewCodes"
                  :key="code"
                  class="px-2 py-0.5 rounded bg-primary/10 text-primary text-[11px] font-bold border border-primary/20"
                >
                  {{ code }}
                </span>
              </div>
            </div>

            <!-- Submit Button -->
            <div class="flex justify-end pt-2">
              <Button.Root
                type="button"
                data-test="submit-batch-btn"
                class="btn btn-primary text-xs px-4 py-2 flex items-center gap-2"
                :disabled="batchPreviewCodes.length === 0 || !batchAreaId"
                @click="handleBatchGenerate"
              >
                <Button.Content>
                  ⚡ {{ t('tableAdmin.batch.submit', { count: batchPreviewCodes.length }) }}
                </Button.Content>
              </Button.Root>
            </div>
          </div>
        </div>

      </div>

      <!-- Footer -->
      <div class="border-t border-border pt-3 flex items-center justify-end shrink-0">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-4 py-2"
          data-test="footer-close-btn"
          @click="emit('close')"
        >
          <Button.Content>{{ t('tableAdmin.actions.close') }}</Button.Content>
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
