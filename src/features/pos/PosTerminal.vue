<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select, Snackbar, Alert } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { createOrderRepository } from '@/core/order/order-repository';
import { money, format, type CurrencyCode, type Money } from '@/core/money';
import { recalculateBill } from '@/core/order/reducer';
import type { BranchMenu } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ComboDoc } from '@/core/catalog/combo';
import type { CatalogRepository } from '@/core/catalog/catalog-repository';
import type { OrderLineItem, BillDoc, SessionDoc, TableDoc, PaymentEntry, TableStatus, OrderAggregateState } from '@/core/order/types';
import type { OrderEventDoc } from '@/core/order/events';
import type { BankAccountDoc } from '@/core/qr/bank-account';
import FloorPlanView from './FloorPlanView.vue';
import PosCatalogPicker from './PosCatalogPicker.vue';
import OrderTicket from './OrderTicket.vue';
import BankSettingsModal from './BankSettingsModal.vue';
import PaymentModal from './PaymentModal.vue';
import ReceiptModal, { type StoreInfo } from './ReceiptModal.vue';
import BillMenuItem from './BillMenuItem.vue';
import SplitBillDialog from './SplitBillDialog.vue';
import MergeBillsDialog from './MergeBillsDialog.vue';
import TransferTableDialog from './TransferTableDialog.vue';
import TableAdminModal from '../table-admin/TableAdminModal.vue';

export type PosMode = 'floor' | 'fast_sale';

export interface DeviceProfile {
  terminalCode: string;
  cashierName: string;
}

const STORAGE_KEY = 'openpos_device_profile';
const TERMINAL_CODES = ['T01', 'T02', 'T03', 'T04'] as const;

const props = withDefaults(
  defineProps<{
    adapter: DbAdapter;
    branchId?: string;
    menu?: BranchMenu | null;
    modifierGroups?: readonly ModifierGroupDoc[];
    combos?: readonly ComboDoc[];
    catalogRepository?: CatalogRepository | null;
    bill?: BillDoc | null;
    session?: SessionDoc | null;
    table?: TableDoc | null;
    tableName?: string;
    guestCount?: number | null;
    storeInfo?: StoreInfo | null;
  }>(),
  {
    branchId: DEFAULT_BRANCH_ID,
    menu: null,
    modifierGroups: () => [],
    combos: () => [],
    catalogRepository: null,
    bill: null,
    session: null,
    table: null,
    tableName: '',
    guestCount: null,
    storeInfo: null,
  },
);

const emit = defineEmits<{
  (e: 'open-bank-settings'): void;
  (e: 'save-bank-account', account: BankAccountDoc): void;
  (e: 'select-table', tableId: string): void;
  (e: 'add-line', item: OrderLineItem): void;
  (e: 'update-line-qty', lineId: string, newQty: number): void;
  (e: 'set-line-note', lineId: string, note: string): void;
  (e: 'void-line', lineId: string, reason: string): void;
  (e: 'print-draft'): void;
  (e: 'checkout'): void;
  (e: 'payment-added', payment: PaymentEntry): void;
  (e: 'payment-complete', bill: BillDoc): void;
  /** Emitted when the session is reloaded after a split/merge/transfer mutation. */
  (e: 'bill-updated', bill: BillDoc): void;
  /** Emitted when a line is moved to another bill (handled inline by PosTerminal). */
  (e: 'move-line', lineId: string, targetBillId: string): void;
}>();

const { t } = useI18n();

/**
 * Kho dữ liệu đơn hàng dùng chung cho toàn bộ luồng POS.
 * Các sub-components (FloorPlan, CatalogPicker, TicketPanel) được cấp repository này.
 */
const orderRepository = createOrderRepository(props.adapter);

/**
 * Chế độ hiển thị chính của POS:
 * - 'floor': Sơ đồ bàn (cho F&B phục vụ tại bàn).
 * - 'fast_sale': Bán nhanh (cho mang đi / quầy gọi món).
 */
const mode = ref<PosMode>('floor');

/** Khôi phục cấu hình máy / thu ngân từ localStorage nếu có. */
function loadInitialProfile(): DeviceProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        return {
          terminalCode:
            typeof parsed.terminalCode === 'string' && parsed.terminalCode
              ? parsed.terminalCode
              : 'T01',
          cashierName:
            typeof parsed.cashierName === 'string' && parsed.cashierName
              ? parsed.cashierName
              : 'Thu ngân',
        };
      }
    }
  } catch {
    // Không đọc được localStorage thì dùng mặc định.
  }
  return { terminalCode: 'T01', cashierName: 'Thu ngân' };
}

const initialProfile = loadInitialProfile();
const terminalCode = ref<string>(initialProfile.terminalCode);
const cashierName = ref<string>(initialProfile.cashierName);

watch([terminalCode, cashierName], ([newCode, newName]) => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ terminalCode: newCode, cashierName: newName }),
    );
  } catch {
    // Không ghi được localStorage (ví dụ quota hoặc chế độ ẩn danh) thì bỏ qua.
  }
});

const selectedTableId = ref<string | null>(null);
const floorSubView = ref<'tables' | 'catalog'>('tables');

export interface TableOrderState {
  session: SessionDoc | null;
  bill: BillDoc | null;
  guestCount: number | null;
}

/** Lưu trữ trạng thái đơn hàng theo từng bàn để cô lập hoàn toàn giữa các bàn. */
const tableOrders = ref<Record<string, TableOrderState>>({});
/** Lưu trữ đơn hàng bán nhanh riêng biệt với đơn theo bàn. */
const fastSaleOrder = ref<TableOrderState>({ session: null, bill: null, guestCount: null });
/** Danh sách active sessions nạp từ CSDL cho sơ đồ bàn. */
const dbActiveSessions = ref<Record<string, OrderAggregateState>>({});

/** Danh sách bàn hiện có, nạp từ repository để phục vụ sơ đồ bàn và chuyển bàn. */
const floorTables = ref<TableDoc[]>([]);

async function loadFloorTables() {
  try {
    const { tables } = await orderRepository.getAreasAndTables(props.branchId);
    floorTables.value = tables;
  } catch {
    floorTables.value = [];
  }
}

async function refreshFloorSessions() {
  try {
    const all = await orderRepository.getAllActiveSessions(props.branchId);
    dbActiveSessions.value = all;
  } catch {
    dbActiveSessions.value = {};
  }
}

watch(
  () => props.branchId,
  () => {
    loadFloorTables();
    refreshFloorSessions();
  },
  { immediate: true },
);

const currentTableDoc = computed<TableDoc | null>(() => {
  if (mode.value !== 'floor' || !selectedTableId.value) return null;
  return (
    floorTables.value.find(
      (t) => t._id === selectedTableId.value || t._id.endsWith(`:${selectedTableId.value}`),
    ) ?? null
  );
});

const effectiveTable = computed<TableDoc | null>(() => {
  return props.table ?? currentTableDoc.value;
});

const effectiveTableName = computed<string>(() => {
  if (props.tableName && props.tableName.trim().length > 0) return props.tableName;
  if (currentTableDoc.value) {
    return currentTableDoc.value.name || currentTableDoc.value.code || '';
  }
  return '';
});

const activeOrderState = computed<TableOrderState>(() => {
  if (mode.value === 'floor') {
    if (selectedTableId.value) {
      return (
        tableOrders.value[selectedTableId.value] ?? {
          session: null,
          bill: null,
          guestCount: null,
        }
      );
    }
    return { session: null, bill: null, guestCount: null };
  }
  return fastSaleOrder.value;
});

const effectiveBill = computed<BillDoc | null>(() => {
  return props.bill ?? activeOrderState.value.bill;
});

const effectiveSession = computed<SessionDoc | null>(() => {
  return props.session ?? activeOrderState.value.session;
});

const effectiveGuestCount = computed<number | null>(() => {
  return (
    props.guestCount ??
    activeOrderState.value.guestCount ??
    effectiveSession.value?.guestCount ??
    null
  );
});

const localBill = computed<BillDoc | null>({
  get: () => effectiveBill.value,
  set: (val) => {
    if (mode.value === 'floor' && selectedTableId.value) {
      const existing = tableOrders.value[selectedTableId.value] ?? {
        session: null,
        bill: null,
        guestCount: null,
      };
      tableOrders.value = {
        ...tableOrders.value,
        [selectedTableId.value]: {
          ...existing,
          bill: val,
        },
      };
    } else {
      fastSaleOrder.value = {
        ...fastSaleOrder.value,
        bill: val,
      };
    }
  },
});

const activeTableStatuses = computed<Record<string, TableStatus>>(() => {
  const result: Record<string, TableStatus> = {};
  for (const table of floorTables.value) {
    const tid = table._id;
    const memOrder = tableOrders.value[tid];
    if (memOrder?.bill && memOrder.bill.lines.some((l: OrderLineItem) => l.status !== 'voided')) {
      result[tid] = memOrder.bill.printedAt ? 'bill_printed' : 'occupied';
      continue;
    }

    const dbState = dbActiveSessions.value[tid] || dbActiveSessions.value[table.code];
    if (dbState?.bill && dbState.bill.lines.some((l: OrderLineItem) => l.status !== 'voided')) {
      result[tid] = dbState.bill.printedAt ? 'bill_printed' : 'occupied';
      continue;
    }

    result[tid] = 'empty';
  }
  return result;
});

const activeTableTotals = computed<Record<string, Money>>(() => {
  const result: Record<string, Money> = {};
  for (const table of floorTables.value) {
    const tid = table._id;
    const memOrder = tableOrders.value[tid];
    if (memOrder?.bill && memOrder.bill.lines.some((l: OrderLineItem) => l.status !== 'voided')) {
      result[tid] = memOrder.bill.balanceRemaining || memOrder.bill.total;
      continue;
    }

    const dbState = dbActiveSessions.value[tid] || dbActiveSessions.value[table.code];
    if (dbState?.bill && dbState.bill.lines.some((l: OrderLineItem) => l.status !== 'voided')) {
      result[tid] = dbState.bill.balanceRemaining || dbState.bill.total;
      continue;
    }
  }
  return result;
});

function createEmptyBill(currency: CurrencyCode = 'VND'): BillDoc {
  const id = `bill:${props.branchId}:${Date.now()}`;
  const code = terminalCode.value || 'T01';
  const rand = Math.floor(1000 + Math.random() * 9000);
  const paymentRef = `POS${props.branchId.toUpperCase()}${code}${rand}`;
  return {
    _id: id,
    branchId: props.branchId,
    sessionId: `session:${props.branchId}:fast_${Date.now()}`,
    billNumber: `${props.branchId.toUpperCase()}-${code}-${rand}`,
    paymentRef,
    status: 'draft',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, currency),
    subtotal: money(0, currency),
    discountTotal: money(0, currency),
    surchargeTotal: money(0, currency),
    total: money(0, currency),
    payments: [],
    balanceRemaining: money(0, currency),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyTableOrder(
  tableId: string,
  currency: CurrencyCode = 'VND',
): { session: SessionDoc; bill: BillDoc } {
  const code = (terminalCode.value || 'T01').toUpperCase();
  const d = new Date();
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  const branchShort = (props.branchId || 'HQ').toUpperCase();
  const billNumber = `${branchShort}-${code}-${dateStr}-${rand}`;
  const paymentRef = `POS${branchShort}${code}${rand}`;
  const tableClean = tableId.replace(/^table:[^:]+:/, '');
  const sessId = `session:${props.branchId}:${tableClean}_${Date.now()}`;
  const bId = `bill:${props.branchId}:${tableClean}_${Date.now()}`;

  const session: SessionDoc = {
    _id: sessId,
    branchId: props.branchId,
    tableIds: [tableId],
    guestCount: 2,
    status: 'open',
    openedAt: new Date().toISOString(),
    openedBy: cashierName.value || 'Thu ngân',
    billIds: [bId],
  };

  const bill: BillDoc = {
    _id: bId,
    branchId: props.branchId,
    sessionId: sessId,
    billNumber,
    paymentRef,
    status: 'draft',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, currency),
    subtotal: money(0, currency),
    discountTotal: money(0, currency),
    surchargeTotal: money(0, currency),
    total: money(0, currency),
    payments: [],
    balanceRemaining: money(0, currency),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return { session, bill };
}

async function handleSelectTable(tableId: string) {
  selectedTableId.value = tableId;
  floorSubView.value = 'catalog';
  emit('select-table', tableId);

  // Nạp session active từ CSDL nếu chưa có trong tableOrders
  if (!tableOrders.value[tableId] || !tableOrders.value[tableId].bill) {
    try {
      const active = await orderRepository.getActiveSession(props.branchId, tableId);
      if (active && active.bill && active.session) {
        tableOrders.value = {
          ...tableOrders.value,
          [tableId]: {
            session: active.session,
            bill: active.bill,
            guestCount: active.session.guestCount ?? null,
          },
        };
      }
    } catch (e) {
      console.warn('getActiveSession failed for table:', tableId, e);
    }
  }
}

function handleDeselectTable() {
  selectedTableId.value = null;
  floorSubView.value = 'tables';
}

async function handleClearTableOrder() {
  if (!selectedTableId.value) return;
  const tid = selectedTableId.value;
  const order = tableOrders.value[tid];
  if (order?.session) {
    try {
      const events: OrderEventDoc[] = [
        {
          eventId: `ev-void-${Date.now()}`,
          type: 'SESSION_CLOSED',
          sessionId: order.session._id,
          billId: order.bill?._id || '',
          actorId: cashierName.value || 'Thu ngân',
          deviceId: terminalCode.value || 'T01',
          payload: { reason: 'Cleared by cashier' },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ];
      await orderRepository.appendEvents(props.branchId, order.session._id, events, {
        session: { ...order.session, status: 'closed', closedAt: new Date().toISOString() },
        bill: order.bill ? { ...order.bill, status: 'voided' } : ({} as BillDoc),
      });
    } catch {
      // non-fatal
    }
  }
  const updated = { ...tableOrders.value };
  delete updated[tid];
  tableOrders.value = updated;
  await refreshFloorSessions();
}

function handleAddLine(item: OrderLineItem) {
  emit('add-line', item);
  if (!props.bill) {
    const curr: CurrencyCode = item.unitPriceSnapshot?.currency ?? 'VND';
    let current = localBill.value;
    if (!current) {
      if (mode.value === 'floor' && selectedTableId.value) {
        const initial = createEmptyTableOrder(selectedTableId.value, curr);
        tableOrders.value = {
          ...tableOrders.value,
          [selectedTableId.value]: {
            session: initial.session,
            bill: initial.bill,
            guestCount: initial.session.guestCount ?? 2,
          },
        };
        current = initial.bill;
      } else {
        const initial = createEmptyBill(curr);
        fastSaleOrder.value = {
          session: null,
          bill: initial,
          guestCount: null,
        };
        current = initial;
      }
    }

    const existingIndex = current.lines.findIndex(
      (l) =>
        l.status === 'placed' &&
        l.productId === item.productId &&
        l.variantId === item.variantId &&
        JSON.stringify(l.modifiers) === JSON.stringify(item.modifiers) &&
        JSON.stringify(l.comboSelections) === JSON.stringify(item.comboSelections),
    );

    let updatedLines: OrderLineItem[];
    if (existingIndex >= 0) {
      updatedLines = current.lines.map((l, idx) =>
        idx === existingIndex ? { ...l, qty: l.qty + item.qty } : l,
      );
    } else {
      updatedLines = [...current.lines, item];
    }

    localBill.value = recalculateBill({
      ...current,
      lines: updatedLines,
      updatedAt: new Date().toISOString(),
    });
  }
}

function handleUpdateQty(lineId: string, newQty: number) {
  emit('update-line-qty', lineId, newQty);
  if (!props.bill && localBill.value) {
    const updatedLines = localBill.value.lines.map((l) =>
      l.lineId === lineId ? { ...l, qty: newQty } : l,
    );
    localBill.value = recalculateBill({
      ...localBill.value,
      lines: updatedLines,
      updatedAt: new Date().toISOString(),
    });
  }
}

function handleSetNote(lineId: string, note: string) {
  emit('set-line-note', lineId, note);
  if (!props.bill && localBill.value) {
    const updatedLines = localBill.value.lines.map((l) =>
      l.lineId === lineId ? { ...l, note } : l,
    );
    localBill.value = {
      ...localBill.value,
      lines: updatedLines,
      updatedAt: new Date().toISOString(),
    };
  }
}

function handleVoidLine(lineId: string, reason: string) {
  emit('void-line', lineId, reason);
  if (!props.bill && localBill.value) {
    const updatedLines = localBill.value.lines.map((l) =>
      l.lineId === lineId ? { ...l, status: 'voided' as const, voidReason: reason } : l,
    );
    localBill.value = recalculateBill({
      ...localBill.value,
      lines: updatedLines,
      updatedAt: new Date().toISOString(),
    });
  }
}

const isBankSettingsOpen = ref(false);
const currentBankAccount = ref<BankAccountDoc | null>(null);

async function loadBankAccount() {
  try {
    currentBankAccount.value = await orderRepository.getBankAccount(props.branchId);
  } catch {
    currentBankAccount.value = null;
  }
}

watch(
  () => props.branchId,
  () => {
    loadBankAccount();
  },
  { immediate: true },
);

function handleOpenBankSettings() {
  isBankSettingsOpen.value = true;
  emit('open-bank-settings');
}

function handleSaveBankAccount(account: BankAccountDoc) {
  currentBankAccount.value = account;
  emit('save-bank-account', account);
}

const isPaymentModalOpen = ref(false);
const isReceiptModalOpen = ref(false);
const receiptBill = ref<BillDoc | null>(null);

function handleCheckout() {
  isPaymentModalOpen.value = true;
  emit('checkout');
}

function handlePaymentAdded(payment: PaymentEntry) {
  emit('payment-added', payment);
  if (!props.bill && localBill.value) {
    const updatedPayments = [...localBill.value.payments, payment];
    localBill.value = recalculateBill({
      ...localBill.value,
      payments: updatedPayments,
      updatedAt: new Date().toISOString(),
    });
  }
}

function handlePrintDraft() {
  if (effectiveBill.value) {
    const updatedBill = {
      ...effectiveBill.value,
      printedAt: new Date().toISOString(),
    };
    localBill.value = updatedBill;
    receiptBill.value = updatedBill;
  } else {
    receiptBill.value = null;
  }
  isReceiptModalOpen.value = true;
  emit('print-draft');
}

async function handlePaymentComplete(completedBill: BillDoc) {
  receiptBill.value = completedBill;
  isReceiptModalOpen.value = true;
  if (!props.bill) {
    if (mode.value === 'floor' && selectedTableId.value) {
      const tid = selectedTableId.value;
      const order = tableOrders.value[tid];
      if (order?.session) {
        try {
          const events: OrderEventDoc[] = [
            {
              eventId: `ev-close-${Date.now()}`,
              type: 'BILL_CLOSED',
              sessionId: order.session._id,
              billId: completedBill._id,
              actorId: cashierName.value || 'Thu ngân',
              deviceId: terminalCode.value || 'T01',
              payload: { bill: completedBill },
              createdAt: new Date().toISOString(),
              schemaVersion: 1,
            },
          ];
          await orderRepository.appendEvents(props.branchId, order.session._id, events, {
            session: { ...order.session, status: 'closed', closedAt: new Date().toISOString() },
            bill: completedBill,
          });
        } catch (e) {
          console.warn('Failed to close session on payment complete:', e);
        }
      }
      const updated = { ...tableOrders.value };
      delete updated[tid];
      tableOrders.value = updated;
      await refreshFloorSessions();
    } else {
      fastSaleOrder.value = { session: null, bill: null, guestCount: null };
    }
  }
  emit('payment-complete', completedBill);
}

// ─── M5: Split / Merge / Transfer ───────────────────────────────────────────

const isSplitDialogOpen = ref(false);
const isMergeDialogOpen = ref(false);
const isTransferDialogOpen = ref(false);

function openSplitDialog() {
  isSplitDialogOpen.value = true;
}

function openMergeDialog() {
  isMergeDialogOpen.value = true;
}

function openTransferDialog() {
  isTransferDialogOpen.value = true;
}

/**
 * M5 split/merge/transfer actions are delegated to the M4 repository methods.
 * The dialogs report the user's selection back through their confirm events;
 * the parent (PosTerminal) owns the repository and applies the change.
 */
async function handleConfirmSplit(payload: {
  mode: 'by-item' | 'evenly' | 'by-seat';
  lineIds?: string[] | undefined;
  parts?: number | undefined;
}) {
  const curBill = effectiveBill.value;
  const curSession = effectiveSession.value;
  if (!curBill || !curSession) {
    isSplitDialogOpen.value = false;
    return;
  }
  try {
    const actorId = cashierName.value || 'unknown';
    const deviceId = terminalCode.value;
    const result =
      payload.mode === 'by-item' && payload.lineIds
        ? await orderRepository.splitByItems(
            props.branchId,
            curSession._id,
            curBill._id,
            payload.lineIds,
            actorId,
            deviceId
          )
        : payload.mode === 'evenly' && payload.parts
        ? await orderRepository.splitEvenly(
            props.branchId,
            curSession._id,
            curBill._id,
            payload.parts,
            actorId,
            deviceId
          )
        : await orderRepository.splitBySeat(
            props.branchId,
            curSession._id,
            curBill._id,
            actorId,
            deviceId
          );
    // Reload state from the new events
    await refreshSession();
    isSplitDialogOpen.value = false;
    emit('print-draft');
    showSuccessToast(t('pos.split.splitSuccess'));
    // Log the emitted events for debug — the caller (PosTerminal host) re-renders via print-draft
    console.debug('split result:', result);
  } catch (err) {
    console.error('split failed:', err);
    showSnackbar(t('pos.split.splitError'), 'error');
  }
}

async function handleConfirmMerge(payload: { billIds: string[] }) {
  const curSession = effectiveSession.value;
  if (!curSession) {
    isMergeDialogOpen.value = false;
    return;
  }
  try {
    const actorId = cashierName.value || 'unknown';
    const deviceId = terminalCode.value;
    const curBill = effectiveBill.value;
    const result = await orderRepository.mergeBills(
      props.branchId,
      curSession._id,
      payload.billIds,
      actorId,
      deviceId,
      candidateMergeBills.value,
      curBill ? { session: curSession, bill: curBill } : undefined
    );

    // Cập nhật hoá đơn đã gộp vào bàn hiện tại
    if (selectedTableId.value && tableOrders.value[selectedTableId.value]) {
      tableOrders.value = {
        ...tableOrders.value,
        [selectedTableId.value]: {
          ...tableOrders.value[selectedTableId.value]!,
          bill: result.mergedBill,
        },
      };
    } else {
      localBill.value = result.mergedBill;
    }

    // Dọn dẹp các bàn khác đã được gộp
    const updated = { ...tableOrders.value };
    for (const [tid, order] of Object.entries(tableOrders.value)) {
      if (
        tid !== selectedTableId.value &&
        order.bill &&
        payload.billIds.includes(order.bill._id)
      ) {
        delete updated[tid];
      }
    }
    tableOrders.value = updated;

    await refreshFloorSessions();
    await refreshSession();
    isMergeDialogOpen.value = false;
    emit('print-draft');
    showSuccessToast(t('pos.split.mergeSuccess'));
    console.debug('merge result:', result);
  } catch (err) {
    console.error('merge failed:', err);
    showSnackbar(t('pos.split.mergeError'), 'error');
  }
}

async function handleConfirmTransfer(payload: { targetTableId: string; reason?: string | undefined }) {
  const curSession = effectiveSession.value;
  if (!curSession) {
    isTransferDialogOpen.value = false;
    return;
  }
  try {
    const actorId = cashierName.value || 'unknown';
    const deviceId = terminalCode.value;
    const fromTid = selectedTableId.value || getCurrentTableId(curSession, effectiveTable.value);
    const curBill = effectiveBill.value;
    const result = await orderRepository.transferTable(
      props.branchId,
      curSession._id,
      fromTid,
      payload.targetTableId,
      actorId,
      deviceId,
      payload.reason,
      curBill ? { session: curSession, bill: curBill } : undefined
    );
    if (fromTid && tableOrders.value[fromTid]) {
      tableOrders.value = {
        ...tableOrders.value,
        [payload.targetTableId]: {
          ...tableOrders.value[fromTid]!,
          session: result.session,
        },
      };
      const updated = { ...tableOrders.value };
      delete updated[fromTid];
      tableOrders.value = updated;
      selectedTableId.value = payload.targetTableId;
    }
    await refreshFloorSessions();
    await refreshSession();
    isTransferDialogOpen.value = false;
    emit('print-draft');
    showSuccessToast(t('pos.split.transferSuccess'));
    console.debug('transfer result:', result);
  } catch (err) {
    console.error('transfer failed:', err);
    showSnackbar(t('pos.split.transferError'), 'error');
  }
}

function handleMoveLine(lineId: string, targetBillId: string) {
  if (!effectiveBill.value || !effectiveSession.value) return;
  // For now emit to parent; in future M6 this will dispatch via repository
  emit('move-line', lineId, targetBillId);
  emit('print-draft');
}

/** Helper: extract current table ID from session + table prop */
function getCurrentTableId(session: SessionDoc | null, table: TableDoc | null | undefined): string {
  if (table) return table._id;
  if (selectedTableId.value) return selectedTableId.value;
  return session?.tableIds[0] ?? '';
}

/** Reload current session after a mutation */
async function refreshSession() {
  const curBill = effectiveBill.value;
  const curSession = effectiveSession.value;
  if (!curBill || !curSession) return;
  try {
    const state = await orderRepository.getActiveSession(props.branchId, curSession._id);
    if (state && state.bill) {
      if (mode.value === 'floor' && selectedTableId.value) {
        tableOrders.value = {
          ...tableOrders.value,
          [selectedTableId.value]: {
            session: state.session,
            bill: state.bill,
            guestCount: state.session.guestCount ?? null,
          },
        };
      }
      emit('bill-updated', state.bill);
      await refreshFloorSessions();
    }
  } catch (e) {
    console.warn('refreshSession failed (non-fatal):', e);
  }
}

/** Snackbar / toast helpers */
function showSuccessToast(message: string) {
  console.log('[M5]', message); // placeholder until Snackbar is fully wired
}

function showSnackbar(message: string, type: 'success' | 'error') {
  console.log(`[M5] ${type}:`, message);
}

/**
 * Danh sách toàn bộ các hoá đơn đang mở, chưa thanh toán để gộp hoá đơn.
 * Thu thập từ bàn hiện tại, các bàn khác trong tableOrders (in-memory) và dbActiveSessions.
 */
const candidateMergeBills = computed<BillDoc[]>(() => {
  const map = new Map<string, BillDoc>();

  // 1. Hoá đơn hiện tại
  if (effectiveBill.value && effectiveBill.value.lines.some((l) => l.status !== 'voided')) {
    map.set(effectiveBill.value._id, effectiveBill.value);
  }

  // 2. Các hoá đơn theo bàn trong bộ nhớ
  for (const order of Object.values(tableOrders.value)) {
    if (
      order.bill &&
      order.bill.status !== 'paid' &&
      order.bill.status !== 'voided' &&
      order.bill.lines.some((l) => l.status !== 'voided')
    ) {
      if (!map.has(order.bill._id)) {
        map.set(order.bill._id, order.bill);
      }
    }
  }

  // 3. Các phiên đang mở nạp từ CSDL
  for (const state of Object.values(dbActiveSessions.value)) {
    if (
      state.bill &&
      state.bill.status !== 'paid' &&
      state.bill.status !== 'voided' &&
      state.bill.lines.some((l) => l.status !== 'voided')
    ) {
      if (!map.has(state.bill._id)) {
        map.set(state.bill._id, state.bill);
      }
    }
  }

  return Array.from(map.values());
});

const tableNamesForBills = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {};

  function resolveTableName(tid: string): string {
    const table = floorTables.value.find(
      (t) => t._id === tid || t._id.endsWith(`:${tid}`) || t.code === tid
    );
    return table?.name || table?.code || tid.replace(/^table:[^:]+:/, '');
  }

  if (effectiveBill.value) {
    result[effectiveBill.value._id] = effectiveTableName.value || 'Hiện tại';
  }

  for (const [tid, order] of Object.entries(tableOrders.value)) {
    if (order.bill) {
      result[order.bill._id] = resolveTableName(tid);
    }
  }

  for (const [tid, state] of Object.entries(dbActiveSessions.value)) {
    if (state.bill && !result[state.bill._id]) {
      result[state.bill._id] = resolveTableName(tid);
    }
  }

  return result;
});

const billsInSession = computed<BillDoc[]>(() => candidateMergeBills.value);
const otherBillsInSession = computed<BillDoc[]>(() => []);

const isTableAdminOpen = ref(false);
const floorPlanRef = ref<{ loadData: () => Promise<void> } | null>(null);

function handleTablesUpdated() {
  floorPlanRef.value?.loadData();
  loadFloorTables();
  refreshFloorSessions();
}

function scrollToTicket() {
  if (typeof document !== 'undefined') {
    const el = document.getElementById('pos-ticket-panel');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

defineExpose({
  orderRepository,
  mode,
  terminalCode,
  cashierName,
  selectedTableId,
  floorSubView,
  isBankSettingsOpen,
  currentBankAccount,
  isPaymentModalOpen,
  isReceiptModalOpen,
  receiptBill,
  effectiveBill,
  effectiveSession,
  effectiveTable,
  effectiveTableName,
  effectiveGuestCount,
  localBill,
  tableOrders,
  activeTableStatuses,
  activeTableTotals,
  handleAddLine,
  handleSelectTable,
  handleDeselectTable,
  handleClearTableOrder,
  handleOpenBankSettings,
  handleSaveBankAccount,
  handleCheckout,
  handlePaymentAdded,
  handlePrintDraft,
  handlePaymentComplete,
});
</script>

<template>
  <div class="pos-terminal flex flex-col h-full bg-bg text-text">
    <!-- Header: thông tin chi nhánh, quầy thu ngân, chuyển chế độ bán hàng, và cài đặt ngân hàng -->
    <header
      class="pos-header flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-surface border-b border-border shadow-xs"
      data-test="pos-header"
    >
      <div class="flex items-center gap-3">
        <!-- Chi nhánh -->
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <span class="font-medium">{{ t('catalog.branch') }}:</span>
          <span
            class="font-semibold uppercase tracking-wider text-text px-2 py-0.5 rounded bg-bg border border-border"
            data-test="branch-code"
          >
            {{ branchId.toUpperCase() }}
          </span>
        </div>

        <!-- Mã máy / terminal -->
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <span class="font-medium">POS:</span>
          <div data-test="terminal-code" class="inline-flex">
            <Select.Root
              v-model="terminalCode"
            >
              <Select.Activator class="field-input py-1 px-2.5 text-xs font-semibold cursor-pointer flex items-center gap-1.5">
                <span>{{ terminalCode }}</span>
                <span class="text-[10px] text-text-muted">▼</span>
              </Select.Activator>
              <Select.Content eager class="panel-card p-1 shadow-xl max-h-60 overflow-y-auto min-w-[6rem] border border-border z-50 bg-surface">
                <Select.Item
                  v-for="code in TERMINAL_CODES"
                  :key="code"
                  :value="code"
                  class="p-2 text-xs rounded-md cursor-pointer hover:bg-bg selected:(bg-primary text-primary-contrast font-medium) transition-colors text-text"
                >
                  {{ code }}
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <!-- Tên thu ngân -->
        <div class="flex items-center gap-1.5 text-xs text-text-muted">
          <span class="font-medium">{{ t('pos.receipt.cashier') }}:</span>
          <Input.Root
            v-model="cashierName"
            data-test="cashier-name"
            class="w-32 md:w-40"
          >
            <Input.Control
              class="field-input py-1 px-2 text-xs"
              :placeholder="t('pos.receipt.cashier')"
            />
          </Input.Root>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Bộ chuyển chế độ: Sơ đồ bàn vs Bán nhanh -->
        <Button.Group
          v-model="mode"
          mandatory
          class="inline-flex gap-1 rounded-md bg-bg p-1 border border-border shadow-xs"
          data-test="mode-switch"
        >
          <Button.Root
            type="button"
            value="floor"
            data-test="mode-floor"
            class="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('pos.mode.floor') }}
          </Button.Root>
          <Button.Root
            type="button"
            value="fast_sale"
            data-test="mode-fast-sale"
            class="cursor-pointer rounded-sm px-3 py-1.5 text-xs font-medium text-text-muted [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {{ t('pos.mode.fastSale') }}
          </Button.Root>
        </Button.Group>

        <!-- Nút mở cấu hình ngân hàng (Task 12) -->
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-2.5 py-1.5 flex items-center gap-1 border border-border rounded-md cursor-pointer hover:bg-bg"
          data-test="bank-settings-trigger"
          @click="handleOpenBankSettings"
        >
          <span>{{ t('pos.bank.title') }}</span>
        </Button.Root>
      </div>
    </header>

    <!-- Thân giao diện: Phân tách 60% bên trái và 40% bên phải -->
    <div class="pos-body flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
      <!-- Cột trái (60% trên màn hình desktop): Sơ đồ bàn hoặc Chọn món bán nhanh -->
      <section class="pos-left-panel md:w-[60%] flex-1 flex flex-col p-4 overflow-y-auto min-h-0">
        <div
          v-if="mode === 'floor'"
          class="floor-plan-panel flex-1 panel-card flex flex-col min-h-0"
          data-test="floor-plan-panel"
        >
          <!-- Thanh điều hướng phụ khi đang chọn bàn (Floor plan vs Table ordering) -->
          <div
            v-if="selectedTableId"
            class="table-ordering-bar mb-3 flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border shrink-0"
            data-test="table-ordering-bar"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-text-muted">
                {{ t('pos.receipt.table') }}:
              </span>
              <span
                class="font-bold text-xs px-2.5 py-1 rounded bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5"
                data-test="selected-table-badge"
              >
                <span>🍽️</span>
                <span>{{ effectiveTableName || selectedTableId.replace(/^table:[^:]+:/, '') }}</span>
                <span class="text-text-muted font-normal text-[11px]">({{ currentTableDoc?.code || selectedTableId.replace(/^table:[^:]+:/, '') }})</span>
                <span v-if="selectedTableId && !effectiveTableName.includes(selectedTableId.replace(/^table:[^:]+:/, ''))" class="sr-only">{{ selectedTableId.replace(/^table:[^:]+:/, '') }}</span>
              </span>

              <span
                v-if="activeTableStatuses[selectedTableId]"
                class="text-[10px] font-medium px-2 py-0.5 rounded border uppercase"
                :class="{
                  'bg-primary/10 text-primary border-primary/20': activeTableStatuses[selectedTableId] === 'occupied',
                  'bg-warning/10 text-warning border-warning/20': activeTableStatuses[selectedTableId] === 'bill_printed',
                  'bg-bg text-text-muted border-border': activeTableStatuses[selectedTableId] === 'empty',
                }"
                data-test="selected-table-status-badge"
              >
                {{
                  activeTableStatuses[selectedTableId] === 'occupied'
                    ? t('pos.table.occupied')
                    : activeTableStatuses[selectedTableId] === 'bill_printed'
                    ? t('pos.table.billPrinted')
                    : t('pos.table.empty')
                }}
              </span>

              <span v-if="effectiveGuestCount" class="text-xs text-text-muted hidden sm:inline">
                👥 {{ t('pos.table.capacity', { count: effectiveGuestCount }) }}
              </span>
            </div>

            <div class="inline-flex items-center gap-1.5">
              <Button.Root
                type="button"
                class="btn text-xs px-2.5 py-1 cursor-pointer"
                :class="floorSubView === 'tables' ? 'btn-primary' : 'btn-ghost'"
                data-test="toggle-floor-tables"
                @click="floorSubView = 'tables'"
              >
                <Button.Content>{{ t('pos.table.backToFloor') }}</Button.Content>
              </Button.Root>
              <Button.Root
                type="button"
                class="btn text-xs px-2.5 py-1 cursor-pointer"
                :class="floorSubView === 'catalog' ? 'btn-primary' : 'btn-ghost'"
                data-test="toggle-floor-catalog"
                @click="floorSubView = 'catalog'"
              >
                <Button.Content>{{ t('pos.table.order') }}</Button.Content>
              </Button.Root>

              <Button.Root
                v-if="effectiveBill && effectiveBill.lines.some((l) => l.status !== 'voided')"
                type="button"
                class="btn btn-ghost text-xs px-2 py-1 text-danger hover:bg-danger/10 cursor-pointer"
                data-test="clear-table-order-btn"
                :title="t('pos.table.clearOrder')"
                @click="handleClearTableOrder"
              >
                <Button.Content>{{ t('pos.table.clearOrder') }}</Button.Content>
              </Button.Root>

              <Button.Root
                type="button"
                class="btn btn-ghost text-xs px-2 py-1 text-text-muted hover:text-text cursor-pointer"
                data-test="deselect-table-btn"
                :title="t('pos.table.deselect')"
                @click="handleDeselectTable"
              >
                <Button.Content>✕ {{ t('pos.table.deselect') }}</Button.Content>
              </Button.Root>
            </div>
          </div>

          <div v-if="floorSubView === 'catalog' && selectedTableId" class="flex-1 min-h-0">
            <PosCatalogPicker
              :adapter="adapter"
              :branch-id="branchId"
              :menu="menu"
              :modifier-groups="modifierGroups"
              :combos="combos"
              :catalog-repository="catalogRepository"
              @add-line="handleAddLine"
            />
          </div>
          <div v-else class="flex-1 min-h-0 flex flex-col">
            <slot
              name="floor-plan"
              :select-table="handleSelectTable"
              :selected-table-id="selectedTableId"
            >
              <FloorPlanView
                ref="floorPlanRef"
                :order-repository="orderRepository"
                :branch-id="branchId"
                :active-table-id="selectedTableId"
                :table-statuses="activeTableStatuses"
                :table-totals="activeTableTotals"
                @select-table="handleSelectTable"
                @open-table-admin="isTableAdminOpen = true"
              />
            </slot>
          </div>
        </div>
        <div
          v-else
          class="fast-sale-panel flex-1 panel-card flex flex-col min-h-0"
          data-test="fast-sale-panel"
        >
          <slot name="fast-sale">
            <PosCatalogPicker
              :adapter="adapter"
              :branch-id="branchId"
              :menu="menu"
              :modifier-groups="modifierGroups"
              :combos="combos"
              :catalog-repository="catalogRepository"
              @add-line="handleAddLine"
            />
          </slot>
        </div>
      </section>

      <!-- Floating mobile order bar (tự hiện trên màn hình nhỏ khi có món trong đơn) -->
      <div
        v-if="effectiveBill && effectiveBill.lines && effectiveBill.lines.some((l) => l.status !== 'voided')"
        class="md:hidden mx-4 my-2 p-3 rounded-xl bg-primary text-primary-contrast shadow-md flex items-center justify-between cursor-pointer select-none active:opacity-90"
        @click="scrollToTicket"
      >
        <div class="flex items-center gap-2">
          <span>🛒</span>
          <span class="font-bold text-xs">
            {{ effectiveBill.lines.filter((l) => l.status !== 'voided').length }} món
          </span>
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono font-bold text-sm">
            {{ format(effectiveBill.balanceRemaining || effectiveBill.total) }}
          </span>
          <span class="text-xs bg-surface/20 px-2 py-0.5 rounded font-medium">Xem đơn →</span>
        </div>
      </div>

      <!-- Cột phải (40% trên màn hình desktop): Chi tiết hoá đơn và thao tác thanh toán -->
      <section
        id="pos-ticket-panel"
        class="pos-right-panel md:w-[40%] flex flex-col p-4 border-t md:border-t-0 md:border-l border-border overflow-y-auto min-h-0"
      >
        <div class="ticket-panel flex-1 panel-card flex flex-col min-h-0 p-0 overflow-hidden" data-test="ticket-panel">
          <slot
            name="ticket"
            :bill="effectiveBill"
            :session="effectiveSession"
            :table="effectiveTable"
            :table-name="effectiveTableName"
          >
            <BillMenuItem
              v-if="effectiveBill"
              :bill="effectiveBill"
              data-test="bill-menu-item"
              @split="openSplitDialog"
              @merge-bills="openMergeDialog"
              @transfer-table="openTransferDialog"
            />
            <OrderTicket
              v-if="effectiveBill"
              :bill="effectiveBill"
              :session="effectiveSession"
              :table="effectiveTable"
              :table-name="effectiveTableName"
              :guest-count="effectiveGuestCount"
              @update-qty="handleUpdateQty"
              @set-line-note="handleSetNote"
              @void-line="handleVoidLine"
              @print-draft="handlePrintDraft"
              @checkout="handleCheckout"
            />
            <div v-else class="p-6 text-center text-text-muted my-auto" data-test="empty-ticket-hint">
              <template v-if="mode === 'floor' && selectedTableId">
                <div class="mb-2">
                  <span class="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    {{ effectiveTableName || selectedTableId.replace(/^table:[^:]+:/, '') }}
                  </span>
                </div>
                <p class="font-medium text-base text-text">{{ t('pos.ticket.empty') }}</p>
                <p class="text-xs mt-1 text-text-muted">{{ t('pos.ticket.emptySubtitle') }}</p>
              </template>
              <template v-else-if="mode === 'floor'">
                <div class="text-3xl mb-2">🍽️</div>
                <p class="font-medium text-base text-text">{{ t('pos.table.selectTableHint') }}</p>
                <p class="text-xs mt-1 text-text-muted">{{ t('pos.mode.floor') }}</p>
              </template>
              <template v-else>
                <p class="font-medium text-base text-text">{{ t('pos.ticket.empty') }}</p>
                <p class="text-xs mt-1 text-text-muted">{{ t('pos.ticket.emptySubtitle') }}</p>
              </template>
            </div>
          </slot>
        </div>
      </section>
    </div>

    <!-- Modal cấu hình tài khoản ngân hàng thụ hưởng (VietQR) -->
    <BankSettingsModal
      v-model:open="isBankSettingsOpen"
      :branch-id="branchId"
      :current-account="currentBankAccount"
      :order-repository="orderRepository"
      @save="handleSaveBankAccount"
    />

    <!-- Modal thanh toán (Tiền mặt, VietQR, Thẻ, Khác, Split Payment) -->
    <PaymentModal
      v-model:open="isPaymentModalOpen"
      :bill="effectiveBill"
      :bank-account="currentBankAccount"
      @payment-added="handlePaymentAdded"
      @complete="handlePaymentComplete"
      @open-bank-settings="handleOpenBankSettings"
    />

    <!-- Modal xem & in hoá đơn nhiệt (ReceiptModal) -->
    <ReceiptModal
      v-model:open="isReceiptModalOpen"
      :bill="receiptBill || effectiveBill"
      :session="session"
      :table-name="tableName"
      :cashier-name="cashierName"
      :branch-name="branchId ? branchId.toUpperCase() : ''"
      :store-info="storeInfo"
      :bank-account="currentBankAccount"
      data-test="receipt-modal"
    />

    <!-- M5: Chia hoá đơn (theo món / đều / theo ghế) -->
    <SplitBillDialog
      v-if="effectiveBill"
      :bill="effectiveBill"
      :open="isSplitDialogOpen"
      @confirm-split="handleConfirmSplit"
      @close="isSplitDialogOpen = false"
    />

    <!-- M5: Gộp hoá đơn -->
    <MergeBillsDialog
      :bills="candidateMergeBills"
      :table-names="tableNamesForBills"
      :current-bill-id="effectiveBill?._id"
      :open="isMergeDialogOpen"
      @confirm-merge="handleConfirmMerge"
      @close="isMergeDialogOpen = false"
    />

    <!-- M5: Chuyển bàn -->
    <TransferTableDialog
      v-if="effectiveSession && effectiveBill"
      :session="effectiveSession"
      :tables="floorTables"
      :current-bill="effectiveBill"
      :other-bills="otherBillsInSession"
      :open="isTransferDialogOpen"
      @confirm-transfer="handleConfirmTransfer"
      @close="isTransferDialogOpen = false"
    />

    <!-- Quản lý Bàn & Tầng (Table & Floor Admin Modal) -->
    <TableAdminModal
      :open="isTableAdminOpen"
      :branch-id="branchId"
      :order-repo="orderRepository"
      @close="isTableAdminOpen = false"
      @tables-updated="handleTablesUpdated"
    />
  </div>
</template>
