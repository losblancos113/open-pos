<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { createOrderRepository } from '@/core/order/order-repository';
import type { BranchMenu } from '@/core/catalog/menu';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { ComboDoc } from '@/core/catalog/combo';
import type { CatalogRepository } from '@/core/catalog/catalog-repository';
import type { OrderLineItem, BillDoc, SessionDoc, TableDoc, PaymentEntry } from '@/core/order/types';
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

function handleSelectTable(tableId: string) {
  selectedTableId.value = tableId;
  emit('select-table', tableId);
}

function handleAddLine(item: OrderLineItem) {
  emit('add-line', item);
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
}

function handlePrintDraft() {
  receiptBill.value = props.bill;
  isReceiptModalOpen.value = true;
  emit('print-draft');
}

function handlePaymentComplete(completedBill: BillDoc) {
  receiptBill.value = completedBill;
  isReceiptModalOpen.value = true;
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
function handleSplitDone() {
  isSplitDialogOpen.value = false;
  emit('print-draft');
}

function handleMergeDone() {
  isMergeDialogOpen.value = false;
  emit('print-draft');
}

function handleTransferDone() {
  isTransferDialogOpen.value = false;
  emit('print-draft');
}

/**
 * Danh sách bàn hiện có, nạp từ repository để phục vụ dialog chuyển bàn.
 * Lỗi nạp (ví dụ chưa có bàn nào) được bỏ qua có chủ ý — dialog vẫn mở được.
 */
const floorTables = ref<TableDoc[]>([]);

async function loadFloorTables() {
  try {
    const { tables } = await orderRepository.getAreasAndTables(props.branchId);
    floorTables.value = tables;
  } catch {
    floorTables.value = [];
  }
}

watch(() => props.branchId, () => { loadFloorTables(); }, { immediate: true });

/**
 * PosTerminal chỉ nhận một `bill` duy nhất qua props. Danh sách hoá đơn
 * trong phiên và các hoá đơn khác suy ra từ bill đó — khi nào có nhiều
 * hoá đơn trên cùng phiên thì mở rộng props tại đây.
 */
const billsInSession = computed<BillDoc[]>(() => (props.bill ? [props.bill] : []));
const otherBillsInSession = computed<BillDoc[]>(() => []);

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
  handleAddLine,
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
              <Select.Activator class="field-input py-1 px-2.5 text-xs font-semibold cursor-pointer">
                {{ terminalCode }}
              </Select.Activator>
              <Select.Content eager>
                <Select.Item
                  v-for="code in TERMINAL_CODES"
                  :key="code"
                  :value="code"
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
            class="table-ordering-bar mb-3 flex items-center justify-between pb-2 border-b border-border shrink-0"
            data-test="table-ordering-bar"
          >
            <div class="flex items-center gap-2">
              <span class="text-xs font-semibold text-text-muted">
                {{ t('pos.receipt.table') }}:
              </span>
              <span class="font-bold text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                {{ selectedTableId.replace(/^table:[^:]+:/, '') }}
              </span>
            </div>

            <div class="inline-flex gap-1">
              <Button.Root
                type="button"
                class="btn text-xs px-2.5 py-1 cursor-pointer"
                :class="floorSubView === 'tables' ? 'btn-primary' : 'btn-ghost'"
                data-test="toggle-floor-tables"
                @click="floorSubView = 'tables'"
              >
                {{ t('pos.table.backToFloor') }}
              </Button.Root>
              <Button.Root
                type="button"
                class="btn text-xs px-2.5 py-1 cursor-pointer"
                :class="floorSubView === 'catalog' ? 'btn-primary' : 'btn-ghost'"
                data-test="toggle-floor-catalog"
                @click="floorSubView = 'catalog'"
              >
                {{ t('pos.table.order') }}
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
                :order-repository="orderRepository"
                :branch-id="branchId"
                :active-table-id="selectedTableId"
                @select-table="handleSelectTable"
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

      <!-- Cột phải (40% trên màn hình desktop): Chi tiết hoá đơn và thao tác thanh toán -->
      <section
        class="pos-right-panel md:w-[40%] flex flex-col p-4 border-t md:border-t-0 md:border-l border-border overflow-y-auto min-h-0"
      >
        <div class="ticket-panel flex-1 panel-card flex flex-col min-h-0 p-0 overflow-hidden" data-test="ticket-panel">
          <slot
            name="ticket"
            :bill="bill"
            :session="session"
            :table="table"
            :table-name="tableName"
          >
            <BillMenuItem
              v-if="bill"
              :bill="bill"
              data-test="bill-menu-item"
              @split="openSplitDialog"
              @merge-bills="openMergeDialog"
              @transfer-table="openTransferDialog"
            />
            <OrderTicket
              v-if="bill"
              :bill="bill"
              :session="session"
              :table="table"
              :table-name="tableName"
              :guest-count="guestCount"
              @update-qty="(lineId, newQty) => emit('update-line-qty', lineId, newQty)"
              @set-line-note="(lineId, note) => emit('set-line-note', lineId, note)"
              @void-line="(lineId, reason) => emit('void-line', lineId, reason)"
              @print-draft="handlePrintDraft"
              @checkout="handleCheckout"
            />
            <div v-else class="p-6 text-center text-text-muted my-auto">
              <p class="font-medium text-base text-text">{{ t('pos.ticket.title') }}</p>
              <p class="text-sm mt-1">
                {{ t('pos.ticket.empty') }}
              </p>
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
      :bill="bill"
      :bank-account="currentBankAccount"
      @payment-added="handlePaymentAdded"
      @complete="handlePaymentComplete"
      @open-bank-settings="handleOpenBankSettings"
    />

    <!-- Modal xem & in hoá đơn nhiệt (ReceiptModal) -->
    <ReceiptModal
      v-model:open="isReceiptModalOpen"
      :bill="receiptBill || bill"
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
      v-if="bill"
      :bill="bill"
      :open="isSplitDialogOpen"
      @split-done="handleSplitDone"
      @close="isSplitDialogOpen = false"
    />

    <!-- M5: Gộp hoá đơn -->
    <MergeBillsDialog
      :bills="billsInSession"
      :open="isMergeDialogOpen"
      @merge-done="handleMergeDone"
      @close="isMergeDialogOpen = false"
    />

    <!-- M5: Chuyển bàn -->
    <TransferTableDialog
      v-if="session && bill"
      :session="session"
      :tables="floorTables"
      :current-bill="bill"
      :other-bills="otherBillsInSession"
      :open="isTransferDialogOpen"
      @transfer-done="handleTransferDone"
      @close="isTransferDialogOpen = false"
    />
  </div>
</template>
