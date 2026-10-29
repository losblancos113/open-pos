<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, DataTable, Input } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import type { UserDoc } from '@/core/auth/types';
import type { OrderRepository } from '@/core/order/order-repository';
import type { BillDoc, PaymentMethod } from '@/core/order/types';
import { bankAccountDocId } from '@/core/db/ids';
import type { BankAccountDoc } from '@/core/qr/bank-account';
import ReceiptModal from '@/features/pos/ReceiptModal.vue';
import BillingSettingsModal from '@/features/pos/BillingSettingsModal.vue';
import { format, money } from '@/core/money';
import {
  listBills,
  voidBill,
  updateBillNote,
  canEditBill,
  type BillFilterOptions,
} from '@/core/order/bill-service';

const props = withDefaults(
  defineProps<{
    adapter?: DbAdapter | null | undefined;
    branchId: string;
    currentUser?: UserDoc | null | undefined;
    orderRepo?: OrderRepository | null | undefined;
  }>(),
  {
    adapter: null,
    currentUser: null,
    orderRepo: null,
  },
);

const emit = defineEmits<{
  (e: 'reprint', bill: BillDoc): void;
  (e: 'updated'): void;
}>();

const { t } = useI18n();

// Filters & Search
const searchQuery = ref('');
const statusFilter = ref<'all' | 'paid' | 'voided' | 'placed'>('all');
const paymentFilter = ref<'all' | PaymentMethod>('all');
const dateFilter = ref<'today' | 'yesterday' | 'last7Days' | 'all'>('today');
const sortBy = ref<'newest' | 'oldest' | 'highestAmount'>('newest');

// Data
const bills = ref<BillDoc[]>([]);
const isLoading = ref(false);

// Detail & Action Modals
const selectedBill = ref<BillDoc | null>(null);
const isDetailOpen = ref(false);
const isVoidDialogOpen = ref(false);
const isEditNoteDialogOpen = ref(false);
const isReceiptModalOpen = ref(false);
const isBillingSettingsOpen = ref(false);
const reprintTargetBill = ref<BillDoc | null>(null);
const bankAccount = ref<BankAccountDoc | null>(null);

async function loadBankAccount() {
  if (props.orderRepo) {
    try {
      bankAccount.value = await props.orderRepo.getBankAccount(props.branchId);
    } catch {
      bankAccount.value = null;
    }
  } else if (props.adapter) {
    try {
      const id = bankAccountDocId(props.branchId);
      const doc = await props.adapter.get(id);
      if (doc && !doc.deletedAt) {
        bankAccount.value = doc as unknown as BankAccountDoc;
      }
    } catch {
      bankAccount.value = null;
    }
  }
}

// Form Inputs
const voidReason = ref('');
const voidError = ref<string | null>(null);
const noteInput = ref('');
const noteError = ref<string | null>(null);
const actionFeedback = ref<string | null>(null);

// Permission Check: only owner or manager can edit/void
const canEdit = computed(() => canEditBill(props.currentUser?.role));

function getDateRange(): { startDate?: string; endDate?: string } {
  const now = new Date();
  if (dateFilter.value === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  if (dateFilter.value === 'yesterday') {
    const yesterdayStart = new Date(now);
    yesterdayStart.setDate(now.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);

    const yesterdayEnd = new Date(now);
    yesterdayEnd.setDate(now.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    return { startDate: yesterdayStart.toISOString(), endDate: yesterdayEnd.toISOString() };
  }
  if (dateFilter.value === 'last7Days') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  }
  // 'all'
  return {};
}

async function loadBills(): Promise<void> {
  if (!props.adapter) return;
  isLoading.value = true;
  try {
    const { startDate, endDate } = getDateRange();
    const filter: BillFilterOptions = {
      startDate,
      endDate,
      status: statusFilter.value,
      paymentMethod: paymentFilter.value,
      query: searchQuery.value,
      sortBy: sortBy.value,
    };
    bills.value = await listBills(props.adapter, props.branchId, filter);
  } catch (err) {
    console.error('Failed to load bills:', err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => [props.adapter, props.branchId, dateFilter.value, statusFilter.value, paymentFilter.value, sortBy.value],
  () => {
    loadBills();
  },
);

let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadBills();
  }, 250);
});

onMounted(() => {
  loadBills();
  loadBankAccount();
});

// Summary Stats
const totalRevenue = computed(() => {
  const currency = bills.value[0]?.total?.currency ?? 'VND';
  const sumMinor = bills.value
    .filter((b) => b.status === 'paid')
    .reduce((acc, b) => acc + (b.total?.minor || 0), 0);
  return money(sumMinor, currency);
});

const paidCount = computed(() => bills.value.filter((b) => b.status === 'paid').length);
const voidedCount = computed(() => bills.value.filter((b) => b.status === 'voided').length);

// Helpers
function formatDateTime(isoString?: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes} ${day}/${month}`;
  } catch {
    return isoString;
  }
}

function getPaymentMethodLabel(method: string): string {
  if (method === 'cash') return t('storeReports.invoices.cash');
  if (method === 'bank_transfer') return t('storeReports.invoices.bankTransfer');
  if (method === 'card') return t('storeReports.invoices.card');
  return t('storeReports.invoices.other');
}

function openDetail(bill: BillDoc): void {
  selectedBill.value = bill;
  isDetailOpen.value = true;
}

function openVoidModal(bill: BillDoc): void {
  if (!canEdit.value) return;
  selectedBill.value = bill;
  voidReason.value = '';
  voidError.value = null;
  isVoidDialogOpen.value = true;
}

function openEditNoteModal(bill: BillDoc): void {
  if (!canEdit.value) return;
  selectedBill.value = bill;
  noteInput.value = bill.note || '';
  noteError.value = null;
  isEditNoteDialogOpen.value = true;
}

async function handleConfirmVoid(): Promise<void> {
  if (!props.adapter || !selectedBill.value) return;
  if (!voidReason.value || voidReason.value.trim() === '') {
    voidError.value = t('storeReports.invoices.voidReasonRequired');
    return;
  }

  try {
    const actorId = props.currentUser?.username || 'admin';
    const actorName = props.currentUser?.displayName || props.currentUser?.username || 'Admin';

    const updated = await voidBill(props.adapter, props.branchId, selectedBill.value._id, {
      reason: voidReason.value.trim(),
      actorId,
      actorName,
    });

    selectedBill.value = updated;
    isVoidDialogOpen.value = false;
    actionFeedback.value = t('storeReports.invoices.voidSuccess');
    setTimeout(() => {
      actionFeedback.value = null;
    }, 3000);

    await loadBills();
    emit('updated');
  } catch (err: any) {
    voidError.value = err?.message || String(err);
  }
}

async function handleSaveNote(): Promise<void> {
  if (!props.adapter || !selectedBill.value) return;
  try {
    const actorId = props.currentUser?.username || 'admin';
    const actorName = props.currentUser?.displayName || props.currentUser?.username || 'Admin';

    const updated = await updateBillNote(
      props.adapter,
      props.branchId,
      selectedBill.value._id,
      noteInput.value,
      { actorId, actorName },
    );

    selectedBill.value = updated;
    isEditNoteDialogOpen.value = false;
    actionFeedback.value = t('storeReports.invoices.saveSuccess');
    setTimeout(() => {
      actionFeedback.value = null;
    }, 3000);

    await loadBills();
    emit('updated');
  } catch (err: any) {
    noteError.value = err?.message || String(err);
  }
}

function handleReprint(bill: BillDoc): void {
  reprintTargetBill.value = bill;
  isReceiptModalOpen.value = true;
  emit('reprint', bill);
}
</script>

<template>
  <div class="space-y-4" data-test="invoice-management-panel">
    <!-- Filter & Search Bar -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-2.5">
      <!-- Search Input -->
      <div class="md:col-span-2">
        <Input.Root
          v-model="searchQuery"
          type="text"
          :label="t('storeReports.invoices.searchPlaceholder')"
          data-test="invoice-search-input"
          class="w-full"
        >
          <Input.Control
            class="field-input w-full bg-surface text-xs"
            :placeholder="t('storeReports.invoices.searchPlaceholder')"
          />
        </Input.Root>
      </div>

      <!-- Date Range Filter -->
      <div>
        <select
          v-model="dateFilter"
          data-test="invoice-date-filter"
          class="field-input w-full bg-surface text-xs h-full"
        >
          <option value="today">{{ t('storeReports.filter.today') }}</option>
          <option value="yesterday">{{ t('storeReports.filter.yesterday') }}</option>
          <option value="last7Days">{{ t('storeReports.filter.last7Days') }}</option>
          <option value="all">{{ t('storeReports.filter.custom') }} ({{ t('common.all') || 'Tất cả' }})</option>
        </select>
      </div>

      <!-- Status Filter -->
      <div>
        <select
          v-model="statusFilter"
          data-test="invoice-status-filter"
          class="field-input w-full bg-surface text-xs h-full"
        >
          <option value="all">{{ t('storeReports.invoices.allStatuses') }}</option>
          <option value="paid">{{ t('storeReports.invoices.statusPaid') }}</option>
          <option value="voided">{{ t('storeReports.invoices.statusVoided') }}</option>
          <option value="placed">{{ t('storeReports.invoices.statusPlaced') }}</option>
        </select>
      </div>
    </div>

    <!-- Secondary Filter & Sorting Controls -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
      <div class="flex items-center gap-2">
        <label class="text-text-muted">{{ t('storeReports.invoices.colPayment') }}:</label>
        <select
          v-model="paymentFilter"
          data-test="invoice-payment-filter"
          class="field-input bg-surface text-xs py-1 px-2 rounded border border-border"
        >
          <option value="all">{{ t('storeReports.invoices.allPayments') }}</option>
          <option value="cash">{{ t('storeReports.invoices.cash') }}</option>
          <option value="bank_transfer">{{ t('storeReports.invoices.bankTransfer') }}</option>
          <option value="card">{{ t('storeReports.invoices.card') }}</option>
        </select>

        <label class="text-text-muted ml-2">{{ t('storeReports.invoices.sortBy') }}:</label>
        <select
          v-model="sortBy"
          data-test="invoice-sort-by"
          class="field-input bg-surface text-xs py-1 px-2 rounded border border-border"
        >
          <option value="newest">{{ t('storeReports.invoices.newest') }}</option>
          <option value="oldest">{{ t('storeReports.invoices.oldest') }}</option>
          <option value="highestAmount">{{ t('storeReports.invoices.highestAmount') }}</option>
        </select>
      </div>

      <div class="flex items-center gap-2">
        <span v-if="!canEdit" class="text-xs text-text-muted italic bg-surface/60 px-2 py-1 rounded border border-border">
          🔒 {{ t('storeReports.invoices.adminOnlyTooltip') }}
        </span>
        <Button.Root
          v-if="canEdit"
          type="button"
          data-test="open-billing-settings-btn"
          class="btn btn-ghost border border-border text-xs px-2.5 py-1"
          :title="t('storeReports.invoices.billingSettingsBtn')"
          @click="isBillingSettingsOpen = true"
        >
          <Button.Content>⚙️ {{ t('storeReports.invoices.billingSettingsBtn') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="refresh-invoices-btn"
          class="btn btn-ghost border border-border text-xs px-2.5 py-1"
          @click="loadBills"
        >
          <Button.Content>🔄 {{ t('common.refresh') || 'Làm mới' }}</Button.Content>
        </Button.Root>
      </div>
    </div>

    <!-- Feedback Toast -->
    <div
      v-if="actionFeedback"
      class="p-2.5 rounded-md bg-success/15 border border-success/30 text-success text-xs font-semibold flex items-center justify-between"
      role="status"
    >
      <span>✓ {{ actionFeedback }}</span>
    </div>

    <!-- Summary KPI Cards -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      <div class="border border-border rounded-lg p-2.5 bg-surface/50">
        <div class="text-xs text-text-muted">{{ t('storeReports.invoices.totalBills') }}</div>
        <div class="text-base font-bold font-mono text-text mt-0.5">{{ bills.length }}</div>
      </div>
      <div class="border border-border rounded-lg p-2.5 bg-surface/50">
        <div class="text-xs text-text-muted">{{ t('storeReports.invoices.totalRevenue') }}</div>
        <div class="text-base font-bold font-mono text-primary mt-0.5">{{ format(totalRevenue) }}</div>
      </div>
      <div class="border border-border rounded-lg p-2.5 bg-surface/50">
        <div class="text-xs text-text-muted">{{ t('storeReports.invoices.paidCount') }}</div>
        <div class="text-base font-bold font-mono text-success mt-0.5">{{ paidCount }}</div>
      </div>
      <div class="border border-border rounded-lg p-2.5 bg-surface/50">
        <div class="text-xs text-text-muted">{{ t('storeReports.invoices.voidedCount') }}</div>
        <div class="text-base font-bold font-mono text-danger mt-0.5">{{ voidedCount }}</div>
      </div>
    </div>

    <!-- Invoices DataTable (Headless Vuetify0 with UnoCSS styling) -->
    <div class="panel-card overflow-x-auto p-0 border border-border">
      <DataTable.Root>
        <DataTable.Table :aria-label="t('storeReports.invoices.title')" class="w-full text-xs text-left">
          <DataTable.Header>
            <DataTable.Row class="bg-surface border-b border-border text-text-muted font-medium">
              <DataTable.Column id="billNumber" class="table-cell">{{ t('storeReports.invoices.colBillNumber') }}</DataTable.Column>
              <DataTable.Column id="table" class="table-cell">{{ t('storeReports.invoices.colTable') }}</DataTable.Column>
              <DataTable.Column id="time" class="table-cell">{{ t('storeReports.invoices.colTime') }}</DataTable.Column>
              <DataTable.Column id="total" class="table-cell text-right">{{ t('storeReports.invoices.colTotal') }}</DataTable.Column>
              <DataTable.Column id="payment" class="table-cell">{{ t('storeReports.invoices.colPayment') }}</DataTable.Column>
              <DataTable.Column id="status" class="table-cell text-center">{{ t('storeReports.invoices.colStatus') }}</DataTable.Column>
              <DataTable.Column id="actions" class="table-cell text-right">{{ t('storeReports.invoices.colActions') }}</DataTable.Column>
            </DataTable.Row>
          </DataTable.Header>

          <DataTable.Body>
            <DataTable.Row
              v-for="bill in bills"
              :id="bill._id"
              :key="bill._id"
              :value="bill"
              class="border-b border-border/50 hover:bg-surface/60 transition-colors"
              data-test="invoice-row"
            >
              <!-- Bill Number -->
              <DataTable.Cell class="table-cell font-mono font-bold text-text">
                <span class="hover:underline cursor-pointer text-primary" @click="openDetail(bill)">
                  {{ bill.billNumber || bill._id.replace(/^bill:[^:]+:/, '') }}
                </span>
                <span v-if="bill.note" class="ml-1 text-[11px] text-text-muted" :title="bill.note">💬</span>
              </DataTable.Cell>

              <!-- Table -->
              <DataTable.Cell class="table-cell">
                <span v-if="bill.tableNameSnapshot" class="font-medium text-text">{{ bill.tableNameSnapshot }}</span>
                <span v-else class="text-text-muted italic">{{ t('storeReports.invoices.takeaway') }}</span>
              </DataTable.Cell>

              <!-- Time -->
              <DataTable.Cell class="table-cell font-mono text-text-muted">
                {{ formatDateTime(bill.paidAt || bill.createdAt) }}
              </DataTable.Cell>

              <!-- Total -->
              <DataTable.Cell class="table-cell text-right font-mono font-bold text-text">
                {{ format(bill.total) }}
              </DataTable.Cell>

              <!-- Payment Method -->
              <DataTable.Cell class="table-cell">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="(pm, idx) in bill.payments || []"
                    :key="idx"
                    class="px-1.5 py-0.5 rounded text-[11px] bg-surface border border-border font-medium"
                  >
                    {{ getPaymentMethodLabel(pm.method) }}
                  </span>
                  <span v-if="!bill.payments?.length" class="text-text-muted text-[11px]">-</span>
                </div>
              </DataTable.Cell>

              <!-- Status Badge -->
              <DataTable.Cell class="table-cell text-center">
                <span
                  v-if="bill.status === 'paid'"
                  class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success/15 text-success border border-success/30"
                  data-test="bill-status-paid"
                >
                  {{ t('storeReports.invoices.statusPaid') }}
                </span>
                <span
                  v-else-if="bill.status === 'voided'"
                  class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30"
                  data-test="bill-status-voided"
                >
                  {{ t('storeReports.invoices.statusVoided') }}
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30"
                  data-test="bill-status-placed"
                >
                  {{ t('storeReports.invoices.statusPlaced') }}
                </span>
              </DataTable.Cell>

              <!-- Actions -->
              <DataTable.Cell class="table-cell text-right">
                <div class="inline-flex items-center gap-1.5 justify-end">
                  <Button.Root
                    type="button"
                    data-test="view-invoice-btn"
                    class="btn btn-ghost text-xs px-2 py-1 border border-border"
                    :title="t('storeReports.invoices.viewDetail')"
                    @click="openDetail(bill)"
                  >
                    <Button.Content>👁️ {{ t('storeReports.invoices.viewDetail') }}</Button.Content>
                  </Button.Root>

                  <Button.Root
                    type="button"
                    data-test="row-reprint-btn"
                    class="btn btn-ghost text-xs px-2 py-1 border border-border"
                    :title="t('storeReports.invoices.reprint')"
                    @click="handleReprint(bill)"
                  >
                    <Button.Content>🖨️ {{ t('storeReports.invoices.reprint') }}</Button.Content>
                  </Button.Root>

                  <!-- Admin/Owner Edit Options -->
                  <template v-if="canEdit">
                    <Button.Root
                      v-if="bill.status !== 'voided'"
                      type="button"
                      data-test="void-invoice-btn"
                      class="btn btn-danger text-xs px-2 py-1"
                      :title="t('storeReports.invoices.void')"
                      @click="openVoidModal(bill)"
                    >
                      <Button.Content>✕ {{ t('storeReports.invoices.void') }}</Button.Content>
                    </Button.Root>
                    <Button.Root
                      type="button"
                      data-test="edit-invoice-note-btn"
                      class="btn btn-ghost text-xs px-2 py-1 border border-border"
                      :title="t('storeReports.invoices.editNote')"
                      @click="openEditNoteModal(bill)"
                    >
                      <Button.Content>✏️</Button.Content>
                    </Button.Root>
                  </template>
                </div>
              </DataTable.Cell>
            </DataTable.Row>

            <!-- Empty State -->
            <DataTable.Empty v-if="bills.length === 0" v-slot="{ columnCount }">
              <DataTable.Row>
                <DataTable.Cell :colspan="columnCount" class="table-cell text-center text-text-muted py-8">
                  {{ isLoading ? t('common.loading') : t('storeReports.invoices.noInvoicesFound') }}
                </DataTable.Cell>
              </DataTable.Row>
            </DataTable.Empty>
          </DataTable.Body>
        </DataTable.Table>
      </DataTable.Root>
    </div>

    <!-- MODAL 1: INVOICE DETAILS MODAL -->
    <div
      v-if="isDetailOpen && selectedBill"
      data-test="invoice-detail-modal"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-4"
    >
      <div class="panel-card w-full max-w-2xl p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between border-b pb-3 border-border">
          <div class="flex items-center gap-2">
            <h3 class="text-base font-bold text-text">
              {{ t('storeReports.invoices.detailTitle') }}:
              <span class="font-mono text-primary">{{ selectedBill.billNumber || selectedBill._id }}</span>
            </h3>
            <span
              v-if="selectedBill.status === 'paid'"
              class="px-2 py-0.5 rounded text-[11px] font-semibold bg-success/15 text-success border border-success/30"
            >
              {{ t('storeReports.invoices.statusPaid') }}
            </span>
            <span
              v-else-if="selectedBill.status === 'voided'"
              class="px-2 py-0.5 rounded text-[11px] font-semibold bg-danger/15 text-danger border border-danger/30"
            >
              {{ t('storeReports.invoices.statusVoided') }}
            </span>
            <span
              v-else
              class="px-2 py-0.5 rounded text-[11px] font-semibold bg-warning/15 text-warning border border-warning/30"
            >
              {{ t('storeReports.invoices.statusPlaced') }}
            </span>
          </div>
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-2 py-1"
            @click="isDetailOpen = false"
          >
            <Button.Content>✕</Button.Content>
          </Button.Root>
        </div>

        <!-- Voided Banner if bill is voided -->
        <div
          v-if="selectedBill.status === 'voided'"
          class="border border-danger/30 bg-danger/10 rounded-lg p-3 text-xs space-y-1 text-danger"
          data-test="voided-detail-banner"
        >
          <div class="font-bold flex items-center gap-1.5">
            ⚠️ {{ t('storeReports.invoices.voidedNotice') }}
          </div>
          <div v-if="selectedBill.voidReason">
            <span class="font-semibold">{{ t('storeReports.invoices.voidReason') }}:</span> {{ selectedBill.voidReason }}
          </div>
          <div class="text-[11px] text-text-muted flex gap-4">
            <span v-if="selectedBill.voidedBy">
              {{ t('storeReports.invoices.voidedBy') }}: <strong class="text-text">{{ selectedBill.voidedBy }}</strong>
            </span>
            <span v-if="selectedBill.voidedAt">
              {{ t('storeReports.invoices.voidedAt') }}: <strong class="text-text font-mono">{{ formatDateTime(selectedBill.voidedAt) }}</strong>
            </span>
          </div>
        </div>

        <!-- Metadata Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-surface/40 p-2.5 rounded-lg border border-border">
          <div>
            <span class="text-text-muted">{{ t('storeReports.invoices.colTable') }}:</span>
            <div class="font-semibold text-text mt-0.5">{{ selectedBill.tableNameSnapshot || t('storeReports.invoices.takeaway') }}</div>
          </div>
          <div>
            <span class="text-text-muted">{{ t('storeReports.invoices.colTime') }}:</span>
            <div class="font-semibold text-text font-mono mt-0.5">{{ formatDateTime(selectedBill.paidAt || selectedBill.createdAt) }}</div>
          </div>
          <div>
            <span class="text-text-muted">{{ t('storeReports.invoices.paymentHistory') }}:</span>
            <div class="font-semibold text-text mt-0.5">
              {{ selectedBill.payments?.map(p => getPaymentMethodLabel(p.method)).join(', ') || '-' }}
            </div>
          </div>
          <div>
            <span class="text-text-muted">{{ t('storeReports.invoices.finalTotal') }}:</span>
            <div class="font-bold text-primary font-mono text-sm mt-0.5">{{ format(selectedBill.total) }}</div>
          </div>
        </div>

        <!-- Ordered Items Table -->
        <div class="space-y-1.5">
          <h4 class="text-xs font-bold uppercase tracking-wider text-text-muted">
            {{ t('storeReports.invoices.itemsList') }} ({{ selectedBill.lines?.length || 0 }})
          </h4>
          <div class="border border-border rounded-lg overflow-x-auto">
            <table class="w-full text-xs text-left">
              <thead class="bg-surface/50 border-b border-border text-text-muted font-medium">
                <tr>
                  <th class="p-2">{{ t('storeReports.invoices.colItemName') }}</th>
                  <th class="p-2 text-center">{{ t('storeReports.invoices.colQuantity') }}</th>
                  <th class="p-2 text-right">{{ t('storeReports.invoices.colUnitPrice') }}</th>
                  <th class="p-2 text-right">{{ t('storeReports.invoices.colLineTotal') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border">
                <tr
                  v-for="line in selectedBill.lines || []"
                  :key="line.lineId"
                  class="hover:bg-surface/40"
                  :class="{ 'opacity-50 line-through text-danger': line.status === 'voided' }"
                >
                  <td class="p-2">
                    <div class="font-semibold text-text">{{ line.nameSnapshot?.vi || line.nameSnapshot?.en || 'Món' }}</div>
                    <div v-if="line.variantNameSnapshot" class="text-[11px] text-text-muted">({{ line.variantNameSnapshot }})</div>
                    <div v-if="line.modifiers?.length" class="text-[11px] text-text-muted">
                      + {{ line.modifiers.map(m => m.optionNameSnapshot).join(', ') }}
                    </div>
                    <div v-if="line.note" class="text-[11px] italic text-primary">Ghi chú: {{ line.note }}</div>
                  </td>
                  <td class="p-2 text-center font-mono font-bold">{{ line.qty }}</td>
                  <td class="p-2 text-right font-mono text-text-muted">{{ format(line.unitPriceSnapshot) }}</td>
                  <td class="p-2 text-right font-mono font-bold text-text">
                    {{ format(money(line.unitPriceSnapshot.minor * line.qty, line.unitPriceSnapshot.currency)) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Bill Totals Breakdown -->
        <div class="border border-border rounded-lg p-3 bg-surface/30 space-y-1.5 text-xs">
          <div class="flex justify-between py-0.5">
            <span class="text-text-muted">{{ t('storeReports.invoices.subtotal') }}</span>
            <span class="font-mono">{{ format(selectedBill.subtotal) }}</span>
          </div>
          <div v-if="selectedBill.discountTotal?.minor > 0" class="flex justify-between py-0.5 text-danger">
            <span>{{ t('storeReports.invoices.discount') }}</span>
            <span class="font-mono">-{{ format(selectedBill.discountTotal) }}</span>
          </div>
          <div v-if="selectedBill.surchargeTotal?.minor > 0" class="flex justify-between py-0.5">
            <span class="text-text-muted">{{ t('storeReports.invoices.surcharge') }}</span>
            <span class="font-mono">+{{ format(selectedBill.surchargeTotal) }}</span>
          </div>
          <div v-if="selectedBill.taxTotal?.minor > 0" class="flex justify-between py-0.5">
            <span class="text-text-muted">{{ t('storeReports.invoices.tax') }}</span>
            <span class="font-mono">+{{ format(selectedBill.taxTotal) }}</span>
          </div>
          <div class="flex justify-between pt-1 border-t border-border font-bold text-sm text-text">
            <span>{{ t('storeReports.invoices.finalTotal') }}</span>
            <span class="font-mono text-primary">{{ format(selectedBill.total) }}</span>
          </div>
        </div>

        <!-- Note Section -->
        <div class="text-xs space-y-1 border-t border-border pt-2">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-text-muted">{{ t('storeReports.invoices.note') }}:</span>
            <Button.Root
              v-if="canEdit"
              type="button"
              class="text-primary hover:underline text-xs"
              @click="openEditNoteModal(selectedBill)"
            >
              <Button.Content>✏️ {{ t('storeReports.invoices.editNote') }}</Button.Content>
            </Button.Root>
          </div>
          <p class="italic text-text bg-surface/60 p-2 rounded border border-border min-h-7">
            {{ selectedBill.note || 'Không có ghi chú' }}
          </p>
        </div>

        <!-- Footer Actions -->
        <div class="flex items-center justify-between border-t pt-3 border-border">
          <div class="flex items-center gap-2">
            <Button.Root
              type="button"
              data-test="detail-reprint-btn"
              class="btn btn-ghost border border-border text-xs px-3 py-1.5"
              @click="handleReprint(selectedBill)"
            >
              <Button.Content>🖨️ {{ t('storeReports.invoices.reprint') }}</Button.Content>
            </Button.Root>

            <Button.Root
              v-if="canEdit && selectedBill.status !== 'voided'"
              type="button"
              data-test="detail-void-btn"
              class="btn btn-danger text-xs px-3 py-1.5"
              @click="openVoidModal(selectedBill)"
            >
              <Button.Content>✕ {{ t('storeReports.invoices.void') }}</Button.Content>
            </Button.Root>
          </div>

          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            @click="isDetailOpen = false"
          >
            <Button.Content>{{ t('common.close') || 'Đóng' }}</Button.Content>
          </Button.Root>
        </div>
      </div>
    </div>

    <!-- MODAL 2: VOID BILL CONFIRMATION (ADMIN / OWNER ONLY) -->
    <div
      v-if="isVoidDialogOpen && selectedBill"
      data-test="void-invoice-dialog"
      class="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4"
    >
      <div class="panel-card w-full max-w-md p-5 space-y-4 shadow-2xl">
        <div class="flex items-center gap-2 text-danger">
          <span class="text-xl">⚠️</span>
          <h3 class="text-base font-bold">{{ t('storeReports.invoices.voidTitle') }}</h3>
        </div>

        <p class="text-xs text-text-muted leading-relaxed">
          {{ t('storeReports.invoices.voidConfirmPrompt') }}
        </p>

        <div class="text-xs font-mono bg-surface p-2 rounded border border-border">
          <strong>{{ selectedBill.billNumber || selectedBill._id }}</strong> - {{ format(selectedBill.total) }}
        </div>

        <!-- Void Reason Input -->
        <div class="space-y-1">
          <label class="field-label text-xs font-semibold text-text">
            {{ t('storeReports.invoices.voidReasonLabel') }} *
          </label>
          <Input.Root
            v-model="voidReason"
            type="text"
            data-test="void-reason-input"
            class="w-full"
          >
            <Input.Control
              class="field-input w-full bg-surface text-xs"
              :placeholder="t('storeReports.invoices.voidReasonPlaceholder')"
            />
          </Input.Root>
          <p v-if="voidError" class="text-[11px] text-danger" role="alert">{{ voidError }}</p>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 border-t pt-3 border-border">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            @click="isVoidDialogOpen = false"
          >
            <Button.Content>{{ t('common.cancel') || 'Huỷ bỏ' }}</Button.Content>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="confirm-void-btn"
            class="btn btn-danger text-xs px-3 py-1.5"
            @click="handleConfirmVoid"
          >
            <Button.Content>{{ t('storeReports.invoices.confirmVoidBtn') }}</Button.Content>
          </Button.Root>
        </div>
      </div>
    </div>

    <!-- MODAL 3: EDIT INVOICE NOTE (ADMIN / OWNER ONLY) -->
    <div
      v-if="isEditNoteDialogOpen && selectedBill"
      data-test="edit-note-dialog"
      class="fixed inset-0 z-70 flex items-center justify-center bg-black/70 p-4"
    >
      <div class="panel-card w-full max-w-md p-5 space-y-4 shadow-2xl">
        <h3 class="text-base font-bold text-text">{{ t('storeReports.invoices.editNoteTitle') }}</h3>

        <div class="space-y-1">
          <label class="field-label text-xs font-semibold text-text">
            {{ t('storeReports.invoices.note') }}
          </label>
          <Input.Root
            v-model="noteInput"
            type="text"
            data-test="edit-note-input"
            class="w-full"
          >
            <Input.Control
              class="field-input w-full bg-surface text-xs"
              :placeholder="t('storeReports.invoices.notePlaceholder')"
            />
          </Input.Root>
          <p v-if="noteError" class="text-[11px] text-danger" role="alert">{{ noteError }}</p>
        </div>

        <div class="flex items-center justify-end gap-2 border-t pt-3 border-border">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5 border border-border"
            @click="isEditNoteDialogOpen = false"
          >
            <Button.Content>{{ t('common.cancel') || 'Huỷ bỏ' }}</Button.Content>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="save-note-btn"
            class="btn btn-primary text-xs px-3 py-1.5"
            @click="handleSaveNote"
          >
            <Button.Content>{{ t('storeReports.invoices.saveNote') }}</Button.Content>
          </Button.Root>
        </div>
      </div>
    </div>

    <!-- MODAL 4: THERMAL RECEIPT SLIP PREVIEW & REPRINT -->
    <ReceiptModal
      v-model:open="isReceiptModalOpen"
      :bill="reprintTargetBill"
      :table-name="reprintTargetBill?.tableNameSnapshot || ''"
      :cashier-name="reprintTargetBill?.voidedBy || ''"
      :branch-name="branchId ? branchId.toUpperCase() : ''"
      :bank-account="bankAccount"
      data-test="reprint-receipt-modal"
    />

    <!-- MODAL 5: BILLING & TAX SETTINGS (MANAGER / ADMIN ONLY) -->
    <BillingSettingsModal
      v-model:open="isBillingSettingsOpen"
      :branch-id="branchId"
      :order-repository="orderRepo"
      :current-user="currentUser"
    />
  </div>
</template>
