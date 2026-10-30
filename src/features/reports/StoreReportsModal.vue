<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { AlarmOutline, BarChartOutline, CardOutline, Checkmark, ClipboardOutline, DownloadOutline, Play, PricetagOutline, ReceiptOutline } from '@vicons/ionicons5';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, DataTable, Input } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import type { UserDoc } from '@/core/auth/types';
import type { OrderRepository } from '@/core/order/order-repository';
import type { BillDoc } from '@/core/order/types';
import InvoiceManagement from './InvoiceManagement.vue';
import {
  generateZReport,
  generateCategorySalesReport,
  generateHourlySalesReport,
  type ZReportSummary,
  type CategorySalesReport,
  type HourlySalesReport,
} from '@/core/reports/store-reports';
import {
  exportZReportToCsv,
  exportCategoryReportToCsv,
  exportHourlyReportToCsv,
} from '@/core/reports/export';
import { format, money } from '@/core/money';

const props = withDefaults(
  defineProps<{
    open?: boolean | undefined;
    adapter?: DbAdapter | null | undefined;
    branchId?: string | undefined;
    currentUser?: UserDoc | null | undefined;
    orderRepo?: OrderRepository | null | undefined;
    initialTab?: 'invoices' | 'zReport' | 'categories' | 'hourly' | 'payments' | undefined;
  }>(),
  {
    open: false,
    branchId: 'hq',
    currentUser: null,
    orderRepo: null,
    initialTab: 'invoices',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'reprint', bill: BillDoc): void;
}>();

const { t } = useI18n();

const activeTab = ref<'invoices' | 'zReport' | 'categories' | 'hourly' | 'payments'>(props.initialTab);
const dateFilter = ref<'today' | 'yesterday' | 'last7Days' | 'custom'>('today');

const zReport = ref<ZReportSummary | null>(null);
const categories = ref<CategorySalesReport[]>([]);
const hourly = ref<HourlySalesReport[]>([]);
const isLoading = ref(false);
const exportFeedback = ref(false);

const categorySearchQuery = ref('');
const expandedCategories = ref<Set<string>>(new Set());

function toggleExpandCategory(categoryId: string) {
  const next = new Set(expandedCategories.value);
  if (next.has(categoryId)) {
    next.delete(categoryId);
  } else {
    next.add(categoryId);
  }
  expandedCategories.value = next;
}

const totalCategoryQuantity = computed(() => {
  return categories.value.reduce((sum, c) => sum + c.quantitySold, 0);
});

const totalCategoryRevenue = computed(() => {
  const currency = categories.value[0]?.netRevenue.currency || 'VND';
  const minor = categories.value.reduce((sum, c) => sum + c.netRevenue.minor, 0);
  return money(minor, currency);
});

const topCategory = computed(() => {
  if (categories.value.length === 0) return null;
  return categories.value[0];
});

const filteredCategories = computed(() => {
  const q = categorySearchQuery.value.trim().toLowerCase();
  if (!q) return categories.value;
  return categories.value.filter((cat) => {
    if (cat.categoryName.toLowerCase().includes(q)) return true;
    if (cat.items?.some((item) => item.productName.toLowerCase().includes(q))) return true;
    return false;
  });
});

function getDateRange(): { start: string; end: string } {
  const now = new Date();
  if (dateFilter.value === 'yesterday') {
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(now.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(now.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    return { start: yesterdayStart.toISOString(), end: yesterdayEnd.toISOString() };
  }

  if (dateFilter.value === 'last7Days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { start: start.toISOString(), end: now.toISOString() };
  }

  // 'today' default
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: now.toISOString() };
}

async function fetchReports() {
  if (!props.adapter) return;
  isLoading.value = true;
  try {
    const range = getDateRange();
    const [z, cats, hrs] = await Promise.all([
      generateZReport(props.adapter, props.branchId, { startDate: range.start, endDate: range.end }),
      generateCategorySalesReport(props.adapter, props.branchId, { startDate: range.start, endDate: range.end }),
      generateHourlySalesReport(props.adapter, props.branchId, { startDate: range.start, endDate: range.end }),
    ]);

    zReport.value = z;
    categories.value = cats;
    hourly.value = hrs;
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.open, dateFilter.value],
  ([isOpen]) => {
    if (isOpen) {
      fetchReports();
    }
  },
  { immediate: true },
);

function handleExportCsv() {
  let csvText = '';
  let filename = 'report.csv';

  if (activeTab.value === 'zReport' || activeTab.value === 'payments') {
    if (!zReport.value) return;
    csvText = exportZReportToCsv(zReport.value);
    filename = `z-report-${props.branchId}.csv`;
  } else if (activeTab.value === 'categories') {
    csvText = exportCategoryReportToCsv(categories.value);
    filename = `categories-sales-${props.branchId}.csv`;
  } else if (activeTab.value === 'hourly') {
    csvText = exportHourlyReportToCsv(hourly.value);
    filename = `hourly-sales-${props.branchId}.csv`;
  }

  if (!csvText) return;

  if (typeof document !== 'undefined') {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportFeedback.value = true;
  setTimeout(() => {
    exportFeedback.value = false;
  }, 3000);
}

function handleReprintBill(bill: BillDoc) {
  emit('reprint', bill);
}

function handleInvoicesUpdated() {
  fetchReports();
}
</script>

<template>
  <div
    v-if="open"
    data-test="store-reports-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="panel-card w-full max-w-5xl p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-3 border-border">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-text">{{ t('storeReports.title') }}</h2>
          <span class="text-xs font-mono px-2 py-0.5 rounded bg-surface border border-border text-text-muted">
            {{ branchId }}
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Button.Root
            v-if="activeTab !== 'invoices'"
            type="button"
            data-test="export-csv-btn"
            class="btn btn-ghost border border-border text-xs px-3 py-1 hover:bg-surface"
            @click="handleExportCsv"
          >
            <Button.Content><AppIcon><DownloadOutline /></AppIcon> {{ t('storeReports.exportCsv') }}</Button.Content>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="close-reports-modal-btn"
            class="btn btn-ghost text-xs px-2.5 py-1"
            @click="emit('close')"
          >
            <Button.Content>{{ t('common.close') }}</Button.Content>
          </Button.Root>
        </div>
      </div>

      <!-- Export Feedback Toast -->
      <div
        v-if="exportFeedback"
        data-test="export-feedback"
        class="p-2 rounded bg-success/15 border border-success/30 text-success text-xs font-semibold flex items-center gap-2"
      >
        <span><AppIcon><Checkmark /></AppIcon> Đã xuất tệp CSV báo cáo thành công</span>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex gap-2 border-b border-border pb-2 overflow-x-auto text-sm">
        <button
          type="button"
          data-test="tab-invoices"
          :class="activeTab === 'invoices' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors flex items-center gap-1.5"
          @click="activeTab = 'invoices'"
        >
          <span><AppIcon><ReceiptOutline /></AppIcon></span>
          <span>{{ t('storeReports.tabs.invoices') }}</span>
        </button>
        <button
          type="button"
          data-test="tab-zreport"
          :class="activeTab === 'zReport' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors flex items-center gap-1.5"
          @click="activeTab = 'zReport'"
        >
          <span><AppIcon><BarChartOutline /></AppIcon></span>
          <span>{{ t('storeReports.tabs.zReport') }}</span>
        </button>
        <button
          type="button"
          data-test="tab-categories"
          :class="activeTab === 'categories' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors flex items-center gap-1.5"
          @click="activeTab = 'categories'"
        >
          <span><AppIcon><PricetagOutline /></AppIcon></span>
          <span>{{ t('storeReports.tabs.categories') }}</span>
        </button>
        <button
          type="button"
          data-test="tab-hourly"
          :class="activeTab === 'hourly' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors flex items-center gap-1.5"
          @click="activeTab = 'hourly'"
        >
          <span><AppIcon><AlarmOutline /></AppIcon></span>
          <span>{{ t('storeReports.tabs.hourly') }}</span>
        </button>
        <button
          type="button"
          data-test="tab-payments"
          :class="activeTab === 'payments' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors flex items-center gap-1.5"
          @click="activeTab = 'payments'"
        >
          <span><AppIcon><CardOutline /></AppIcon></span>
          <span>{{ t('storeReports.tabs.payments') }}</span>
        </button>
      </div>

      <!-- Controls: Date Range Filter (For Report Tabs) -->
      <div v-if="activeTab !== 'invoices'" class="flex items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-1.5 bg-surface p-1 rounded-lg border border-border">
          <button
            type="button"
            :class="dateFilter === 'today' ? 'bg-primary text-primary-contrast font-bold' : 'text-text-muted hover:text-text'"
            class="px-2.5 py-1 rounded transition-colors"
            @click="dateFilter = 'today'"
          >
            {{ t('storeReports.filter.today') }}
          </button>
          <button
            type="button"
            :class="dateFilter === 'yesterday' ? 'bg-primary text-primary-contrast font-bold' : 'text-text-muted hover:text-text'"
            class="px-2.5 py-1 rounded transition-colors"
            @click="dateFilter = 'yesterday'"
          >
            {{ t('storeReports.filter.yesterday') }}
          </button>
          <button
            type="button"
            :class="dateFilter === 'last7Days' ? 'bg-primary text-primary-contrast font-bold' : 'text-text-muted hover:text-text'"
            class="px-2.5 py-1 rounded transition-colors"
            @click="dateFilter = 'last7Days'"
          >
            {{ t('storeReports.filter.last7Days') }}
          </button>
        </div>
      </div>

      <!-- Loading State for Report Tabs -->
      <div v-if="isLoading && activeTab !== 'invoices'" class="py-12 text-center text-text-muted text-sm">
        {{ t('common.loading') }}
      </div>

      <!-- TAB 1: INVOICES MANAGEMENT -->
      <div v-if="activeTab === 'invoices'" data-test="invoices-panel">
        <InvoiceManagement
          :adapter="adapter"
          :branch-id="branchId"
          :current-user="currentUser"
          :order-repo="orderRepo"
          @reprint="handleReprintBill"
          @updated="handleInvoicesUpdated"
        />
      </div>

      <!-- TAB 2: Z-REPORT -->
      <div v-if="!isLoading && activeTab === 'zReport' && zReport" class="space-y-4" data-test="z-report-panel">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('storeReports.grossSales') }}</div>
            <div class="text-base font-bold text-text font-mono mt-0.5">{{ format(zReport.grossSales) }}</div>
          </div>
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('storeReports.discounts') }}</div>
            <div class="text-base font-bold text-danger font-mono mt-0.5">-{{ format(zReport.discountTotal) }}</div>
          </div>
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('storeReports.netSales') }}</div>
            <div class="text-base font-bold text-primary font-mono mt-0.5">{{ format(zReport.netSales) }}</div>
          </div>
          <div class="border border-border rounded-lg p-3 bg-surface/50">
            <div class="text-xs text-text-muted">{{ t('storeReports.totalOrders') }}</div>
            <div class="text-base font-bold text-text font-mono mt-0.5">{{ zReport.paidBills }}</div>
          </div>
        </div>

        <!-- Cash Drawer Breakdown -->
        <div class="border border-border rounded-lg p-4 bg-surface/30 space-y-2 text-xs">
          <h4 class="font-bold text-text uppercase tracking-wider mb-2">Đối soát tiền mặt</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.openingCash') }}</span>
                <span class="font-mono font-semibold">{{ format(zReport.openingCash) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashSales') }}</span>
                <span class="font-mono font-semibold text-success">+{{ format(zReport.cashSales) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashIn') }}</span>
                <span class="font-mono font-semibold text-primary">+{{ format(zReport.cashIn) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashDrop') }}</span>
                <span class="font-mono font-semibold text-danger">-{{ format(zReport.cashDrops) }}</span>
              </div>
            </div>

            <div class="space-y-1.5 border-t md:border-t-0 md:border-l border-border md:pl-4 pt-2 md:pt-0">
              <div class="flex justify-between py-1 border-b border-border font-bold">
                <span class="text-text">{{ t('storeReports.expectedCash') }}</span>
                <span class="font-mono text-primary text-sm">{{ format(zReport.expectedCash) }}</span>
              </div>
              <div v-if="zReport.countedCash" class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.countedCash') }}</span>
                <span class="font-mono font-semibold">{{ format(zReport.countedCash) }}</span>
              </div>
              <div v-if="zReport.variance" class="flex justify-between py-1 border-b border-border font-bold">
                <span class="text-text-muted">{{ t('shift.variance') }}</span>
                <span
                  class="font-mono"
                  :class="zReport.variance.minor === 0 ? 'text-success' : 'text-danger'"
                >
                  {{ format(zReport.variance) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 3: CATEGORIES (HEADLESS DATATABLE) -->
      <div v-if="!isLoading && activeTab === 'categories'" class="space-y-4" data-test="categories-panel">
        <!-- Overview summary cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div class="panel-card border border-border p-3 flex flex-col gap-1">
            <span class="text-text-muted font-medium">{{ t('storeReports.totalCategories') }}</span>
            <span class="font-mono text-base font-bold text-text" data-test="total-categories-count">{{ categories.length }}</span>
          </div>
          <div class="panel-card border border-border p-3 flex flex-col gap-1">
            <span class="text-text-muted font-medium">{{ t('storeReports.totalQuantity') }}</span>
            <span class="font-mono text-base font-bold text-text" data-test="total-categories-qty">{{ totalCategoryQuantity }}</span>
          </div>
          <div class="panel-card border border-border p-3 flex flex-col gap-1">
            <span class="text-text-muted font-medium">{{ t('storeReports.totalCategoryRevenue') }}</span>
            <span class="font-mono text-base font-bold text-primary" data-test="total-categories-revenue">{{ format(totalCategoryRevenue) }}</span>
          </div>
          <div class="panel-card border border-border p-3 flex flex-col gap-1">
            <span class="text-text-muted font-medium">{{ t('storeReports.topCategory') }}</span>
            <span class="font-mono text-sm font-bold text-success truncate" data-test="top-category-name">
              {{ topCategory ? `${topCategory.categoryName} (${topCategory.percentageOfTotal}%)` : '—' }}
            </span>
          </div>
        </div>

        <!-- Search input & count -->
        <div class="flex items-center justify-between gap-3">
          <div class="w-full sm:w-72">
            <Input.Root
              v-model="categorySearchQuery"
              type="text"
              :label="t('storeReports.searchCategory')"
              data-test="category-search-input"
              class="w-full"
            >
              <Input.Control
                class="field-input w-full bg-surface text-xs"
                :placeholder="t('storeReports.searchCategory')"
              />
            </Input.Root>
          </div>
          <div class="text-xs text-text-muted font-mono">
            {{ filteredCategories.length }} / {{ categories.length }} {{ t('storeReports.tabs.categories').toLowerCase() }}
          </div>
        </div>

        <div class="panel-card overflow-x-auto p-0 border border-border">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('storeReports.tabs.categories')" class="w-full text-xs text-left">
              <DataTable.Header>
                <DataTable.Row class="bg-surface border-b border-border text-text-muted font-medium">
                  <DataTable.Column id="name" class="table-cell">{{ t('storeReports.categoryName') }}</DataTable.Column>
                  <DataTable.Column id="qty" class="table-cell text-right">{{ t('storeReports.quantitySold') }}</DataTable.Column>
                  <DataTable.Column id="sales" class="table-cell text-right">{{ t('storeReports.netSales') }}</DataTable.Column>
                  <DataTable.Column id="share" class="table-cell text-right">{{ t('storeReports.share') }}</DataTable.Column>
                  <DataTable.Column id="actions" class="table-cell text-center w-28">{{ t('storeReports.itemBreakdown') }}</DataTable.Column>
                </DataTable.Row>
              </DataTable.Header>
              <DataTable.Body>
                <template v-for="cat in filteredCategories" :key="cat.categoryId">
                  <DataTable.Row
                    :id="cat.categoryId"
                    class="border-b border-border last:border-b-0 hover:bg-surface/50 cursor-pointer transition-colors"
                    :class="{ 'bg-surface/30': expandedCategories.has(cat.categoryId) }"
                    @click="toggleExpandCategory(cat.categoryId)"
                  >
                    <DataTable.Cell class="table-cell font-medium text-text">
                      <div class="flex items-center gap-2">
                        <span class="text-text-muted text-[10px] transition-transform inline-block" :class="{ 'rotate-90': expandedCategories.has(cat.categoryId) }"><AppIcon><Play /></AppIcon></span>
                        <span>{{ cat.categoryName }}</span>
                        <span
                          v-if="cat.items && cat.items.length > 0"
                          class="text-[10px] bg-surface-variant text-text-muted px-1.5 py-0.5 rounded-full"
                        >
                          {{ cat.items.length }} {{ t('catalog.tab.products')?.toLowerCase() || 'món' }}
                        </span>
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell class="table-cell text-right font-mono text-text-muted">{{ cat.quantitySold }}</DataTable.Cell>
                    <DataTable.Cell class="table-cell text-right font-mono font-semibold text-text">{{ format(cat.netRevenue) }}</DataTable.Cell>
                    <DataTable.Cell class="table-cell text-right font-mono text-text-muted">
                      <div class="flex items-center justify-end gap-2">
                        <div class="w-16 bg-surface-variant rounded-full h-1.5 overflow-hidden hidden sm:block">
                          <div class="bg-primary h-full rounded-full" :style="{ width: `${cat.percentageOfTotal}%` }"></div>
                        </div>
                        <span>{{ cat.percentageOfTotal }}%</span>
                      </div>
                    </DataTable.Cell>
                    <DataTable.Cell class="table-cell text-center" @click.stop>
                      <Button.Root
                        class="btn-ghost text-xs px-2 py-0.5 text-primary hover:bg-surface-variant rounded"
                        :data-test="`toggle-items-${cat.categoryId}`"
                        @click="toggleExpandCategory(cat.categoryId)"
                      >
                        <Button.Content>
                          {{ expandedCategories.has(cat.categoryId) ? t('storeReports.hideItems') : t('storeReports.viewItems') }}
                        </Button.Content>
                      </Button.Root>
                    </DataTable.Cell>
                  </DataTable.Row>

                  <!-- Expanded Item Breakdown -->
                  <DataTable.Row
                    v-if="expandedCategories.has(cat.categoryId)"
                    :id="`${cat.categoryId}-items`"
                    class="bg-surface/80 border-b border-border"
                    :data-test="`cat-items-row-${cat.categoryId}`"
                  >
                    <DataTable.Cell :colspan="5" class="p-3 pl-8">
                      <div class="rounded border border-border/80 bg-background overflow-hidden">
                        <div class="bg-surface px-3 py-1.5 border-b border-border text-[11px] font-semibold text-text-muted flex justify-between">
                          <span><AppIcon><ClipboardOutline /></AppIcon> {{ t('storeReports.itemBreakdown') }}: {{ cat.categoryName }}</span>
                          <span v-if="cat.items">{{ cat.items.length }} món</span>
                        </div>
                        <table v-if="cat.items && cat.items.length > 0" class="w-full text-xs text-left">
                          <thead>
                            <tr class="border-b border-border/60 text-text-muted text-[11px]">
                              <th class="px-3 py-1.5 font-medium">{{ t('storeReports.itemName') }}</th>
                              <th class="px-3 py-1.5 font-medium text-right">{{ t('storeReports.quantitySold') }}</th>
                              <th class="px-3 py-1.5 font-medium text-right">{{ t('storeReports.netSales') }}</th>
                              <th class="px-3 py-1.5 font-medium text-right">{{ t('storeReports.shareInCategory') }}</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="item in cat.items"
                              :key="item.productId"
                              class="border-b border-border/40 last:border-b-0 hover:bg-surface/30"
                              :data-test="`cat-item-${item.productId}`"
                            >
                              <td class="px-3 py-1.5 text-text font-medium">{{ item.productName }}</td>
                              <td class="px-3 py-1.5 text-right font-mono text-text-muted">{{ item.quantitySold }}</td>
                              <td class="px-3 py-1.5 text-right font-mono text-text">{{ format(item.netRevenue) }}</td>
                              <td class="px-3 py-1.5 text-right font-mono text-text-muted">
                                <div class="flex items-center justify-end gap-1.5">
                                  <div class="w-12 bg-surface-variant rounded-full h-1 overflow-hidden hidden sm:block">
                                    <div class="bg-success h-full rounded-full" :style="{ width: `${item.percentageOfCategory}%` }"></div>
                                  </div>
                                  <span>{{ item.percentageOfCategory }}%</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <div v-else class="p-3 text-center text-text-muted text-xs">
                          {{ t('storeReports.noItemsInCategory') }}
                        </div>
                      </div>
                    </DataTable.Cell>
                  </DataTable.Row>
                </template>

                <DataTable.Row v-if="filteredCategories.length === 0">
                  <DataTable.Cell :colspan="5" class="p-6 text-center text-text-muted">
                    {{ t('common.empty') }}
                  </DataTable.Cell>
                </DataTable.Row>
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </div>
      </div>

      <!-- TAB 4: HOURLY SALES (HEADLESS DATATABLE) -->
      <div v-if="!isLoading && activeTab === 'hourly'" class="space-y-3" data-test="hourly-panel">
        <div class="panel-card overflow-x-auto p-0 border border-border max-h-96">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('storeReports.tabs.hourly')" class="w-full text-xs text-left">
              <DataTable.Header>
                <DataTable.Row class="bg-surface border-b border-border text-text-muted font-medium sticky top-0">
                  <DataTable.Column id="hour" class="table-cell">{{ t('storeReports.hourRange') }}</DataTable.Column>
                  <DataTable.Column id="orders" class="table-cell text-right">{{ t('storeReports.totalOrders') }}</DataTable.Column>
                  <DataTable.Column id="sales" class="table-cell text-right">{{ t('storeReports.netSales') }}</DataTable.Column>
                </DataTable.Row>
              </DataTable.Header>
              <DataTable.Body>
                <DataTable.Row
                  v-for="slot in hourly"
                  :id="String(slot.hour)"
                  :key="slot.hour"
                  class="border-b border-border last:border-b-0 hover:bg-surface/50"
                  :class="slot.orderCount > 0 ? 'bg-primary/5 font-medium' : ''"
                >
                  <DataTable.Cell class="table-cell font-mono">
                    {{ String(slot.hour).padStart(2, '0') }}:00 - {{ String(slot.hour).padStart(2, '0') }}:59
                  </DataTable.Cell>
                  <DataTable.Cell
                    class="table-cell text-right font-mono"
                    :class="slot.orderCount > 0 ? 'font-bold text-primary' : 'text-text-muted'"
                  >
                    {{ slot.orderCount }}
                  </DataTable.Cell>
                  <DataTable.Cell class="table-cell text-right font-mono font-semibold">
                    {{ format(slot.netRevenue) }}
                  </DataTable.Cell>
                </DataTable.Row>
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </div>
      </div>

      <!-- TAB 5: PAYMENTS (HEADLESS DATATABLE) -->
      <div v-if="!isLoading && activeTab === 'payments' && zReport" class="space-y-3" data-test="payments-panel">
        <div class="panel-card overflow-x-auto p-0 border border-border">
          <DataTable.Root>
            <DataTable.Table :aria-label="t('storeReports.tabs.payments')" class="w-full text-xs text-left">
              <DataTable.Header>
                <DataTable.Row class="bg-surface border-b border-border text-text-muted font-medium">
                  <DataTable.Column id="method" class="table-cell">{{ t('storeReports.invoices.colPayment') }}</DataTable.Column>
                  <DataTable.Column id="total" class="table-cell text-right">{{ t('storeReports.invoices.colTotal') }}</DataTable.Column>
                </DataTable.Row>
              </DataTable.Header>
              <DataTable.Body>
                <DataTable.Row
                  v-for="(amount, method) in zReport.paymentsByMethod"
                  :id="String(method)"
                  :key="method"
                  class="border-b border-border last:border-b-0 hover:bg-surface/50"
                >
                  <DataTable.Cell class="table-cell font-medium text-text uppercase">{{ method }}</DataTable.Cell>
                  <DataTable.Cell class="table-cell text-right font-mono font-bold text-primary">{{ format(amount) }}</DataTable.Cell>
                </DataTable.Row>
                <DataTable.Empty v-if="Object.keys(zReport.paymentsByMethod).length === 0" v-slot="{ columnCount }">
                  <DataTable.Row>
                    <DataTable.Cell :colspan="columnCount" class="table-cell text-center text-text-muted py-6">
                      {{ t('storeReports.invoices.noInvoicesFound') }}
                    </DataTable.Cell>
                  </DataTable.Row>
                </DataTable.Empty>
              </DataTable.Body>
            </DataTable.Table>
          </DataTable.Root>
        </div>
      </div>
    </div>
  </div>
</template>
