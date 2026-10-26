<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
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
import { format } from '@/core/money';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    adapter?: DbAdapter | null;
    branchId?: string;
  }>(),
  {
    open: false,
    branchId: 'hq',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const activeTab = ref<'zReport' | 'categories' | 'hourly' | 'payments'>('zReport');
const dateFilter = ref<'today' | 'yesterday' | 'last7Days' | 'custom'>('today');

const zReport = ref<ZReportSummary | null>(null);
const categories = ref<CategorySalesReport[]>([]);
const hourly = ref<HourlySalesReport[]>([]);
const isLoading = ref(false);
const exportFeedback = ref(false);

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

  // default: today
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return { start: todayStart.toISOString(), end: now.toISOString() };
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

  // Trigger browser download if document object exists
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
</script>

<template>
  <div
    v-if="open"
    data-test="store-reports-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="panel-card w-full max-w-4xl p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto flex flex-col">
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
            type="button"
            data-test="export-csv-btn"
            class="btn btn-ghost border border-border text-xs px-3 py-1 hover:bg-surface"
            @click="handleExportCsv"
          >
            <Button.Content>📥 {{ t('storeReports.exportCsv') }}</Button.Content>
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

      <!-- Export Success Feedback -->
      <div v-if="exportFeedback" class="p-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded">
        ✓ {{ t('storeReports.exportCsv') }} thành công!
      </div>

      <!-- Controls: Date Range Filter -->
      <div class="flex items-center justify-between gap-3 text-xs">
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

      <!-- Navigation Tabs -->
      <div class="flex gap-2 border-b border-border pb-2 overflow-x-auto text-sm">
        <button
          type="button"
          data-test="tab-zreport"
          :class="activeTab === 'zReport' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'zReport'"
        >
          {{ t('storeReports.tabs.zReport') }}
        </button>
        <button
          type="button"
          data-test="tab-categories"
          :class="activeTab === 'categories' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'categories'"
        >
          {{ t('storeReports.tabs.categories') }}
        </button>
        <button
          type="button"
          data-test="tab-hourly"
          :class="activeTab === 'hourly' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'hourly'"
        >
          {{ t('storeReports.tabs.hourly') }}
        </button>
        <button
          type="button"
          data-test="tab-payments"
          :class="activeTab === 'payments' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'payments'"
        >
          {{ t('storeReports.tabs.payments') }}
        </button>
      </div>

      <!-- Tab 1: Z-Report -->
      <div v-if="activeTab === 'zReport' && zReport" class="space-y-4" data-test="z-report-panel">
        <div class="grid grid-cols-4 gap-3">
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
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.openingCash') }}</span>
                <span class="font-mono font-semibold">{{ format(zReport.openingCash) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashSales') }}</span>
                <span class="font-mono font-semibold text-primary">+{{ format(zReport.cashSales) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashIn') }}</span>
                <span class="font-mono font-semibold text-primary">+{{ format(zReport.cashIn) }}</span>
              </div>
            </div>

            <div class="space-y-1.5">
              <div class="flex justify-between py-1 border-b border-border">
                <span class="text-text-muted">{{ t('shift.cashDrop') }}</span>
                <span class="font-mono font-semibold text-danger">-{{ format(zReport.cashDrops) }}</span>
              </div>
              <div class="flex justify-between py-1 border-b border-border font-bold">
                <span>{{ t('storeReports.expectedCash') }}</span>
                <span class="font-mono text-primary">{{ format(zReport.expectedCash) }}</span>
              </div>
              <div v-if="zReport.countedCash" class="flex justify-between py-1 border-b border-border font-bold">
                <span>{{ t('shift.countedCash') }}</span>
                <span class="font-mono">{{ format(zReport.countedCash) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Tab 2: Categories -->
      <div v-if="activeTab === 'categories'" class="space-y-3" data-test="categories-panel">
        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium">
              <tr>
                <th class="px-3 py-2">{{ t('storeReports.categoryName') }}</th>
                <th class="px-3 py-2 text-right">{{ t('storeReports.quantitySold') }}</th>
                <th class="px-3 py-2 text-right">{{ t('storeReports.netSales') }}</th>
                <th class="px-3 py-2 text-right">{{ t('storeReports.share') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="cat in categories"
                :key="cat.categoryId"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
              >
                <td class="px-3 py-2.5 font-medium text-text">{{ cat.categoryName }}</td>
                <td class="px-3 py-2.5 text-right font-mono text-text-muted">{{ cat.quantitySold }}</td>
                <td class="px-3 py-2.5 text-right font-mono font-semibold text-text">{{ format(cat.netRevenue) }}</td>
                <td class="px-3 py-2.5 text-right font-mono text-text-muted">{{ cat.percentageOfTotal }}%</td>
              </tr>
              <tr v-if="categories.length === 0">
                <td colspan="4" class="px-3 py-6 text-center text-text-muted">
                  {{ t('catalog.noItems') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 3: Hourly Heatmap -->
      <div v-if="activeTab === 'hourly'" class="space-y-3" data-test="hourly-panel">
        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto max-h-96">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium sticky top-0">
              <tr>
                <th class="px-3 py-2">{{ t('storeReports.hourRange') }}</th>
                <th class="px-3 py-2 text-right">{{ t('storeReports.totalOrders') }}</th>
                <th class="px-3 py-2 text-right">{{ t('storeReports.netSales') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="slot in hourly"
                :key="slot.hour"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
                :class="slot.orderCount > 0 ? 'bg-primary/5 font-medium' : ''"
              >
                <td class="px-3 py-2 font-mono">
                  {{ String(slot.hour).padStart(2, '0') }}:00 - {{ String(slot.hour).padStart(2, '0') }}:59
                </td>
                <td class="px-3 py-2 text-right font-mono" :class="slot.orderCount > 0 ? 'font-bold text-primary' : 'text-text-muted'">
                  {{ slot.orderCount }}
                </td>
                <td class="px-3 py-2 text-right font-mono font-semibold">
                  {{ format(slot.netRevenue) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 4: Payments -->
      <div v-if="activeTab === 'payments' && zReport" class="space-y-3" data-test="payments-panel">
        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium">
              <tr>
                <th class="px-3 py-2">Phương thức</th>
                <th class="px-3 py-2 text-right">Tổng tiền</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(amount, method) in zReport.paymentsByMethod"
                :key="method"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
              >
                <td class="px-3 py-2.5 font-medium text-text uppercase">{{ method }}</td>
                <td class="px-3 py-2.5 text-right font-mono font-bold text-primary">{{ format(amount) }}</td>
              </tr>
              <tr v-if="Object.keys(zReport.paymentsByMethod).length === 0">
                <td colspan="2" class="px-3 py-6 text-center text-text-muted">
                  Chưa có giao dịch thanh toán nào
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
