<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { CardOutline, CheckmarkCircle, Close, DocumentTextOutline, FastFoodOutline, HourglassOutline, PrintOutline, StopwatchOutline } from '@vicons/ionicons5';
import { ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Dialog } from '@vuetify/v0';
import type { BillDoc, SessionDoc, TableDoc, OrderLineItem } from '@/core/order/types';
import type { BillingSettingsDoc } from '@/core/order/billing-settings';
import { calculateLineTotal } from '@/core/order/reducer';
import { format } from '@/core/money';

const props = withDefaults(
  defineProps<{
    bill?: BillDoc | null;
    session?: SessionDoc | null;
    table?: TableDoc | null;
    tableName?: string;
    guestCount?: number | null;
    readOnly?: boolean;
    otherBills?: BillDoc[];
    billingSettings?: BillingSettingsDoc | null;
  }>(),
  {
    bill: null,
    session: null,
    table: null,
    tableName: '',
    guestCount: null,
    readOnly: false,
    otherBills: () => [],
    billingSettings: null,
  },
);

const emit = defineEmits<{
  (e: 'update-qty', lineId: string, newQty: number): void;
  (e: 'set-line-note', lineId: string, note: string): void;
  (e: 'void-line', lineId: string, reason: string): void;
  (e: 'move-line', lineId: string, targetBillId: string): void;
  (e: 'print-draft'): void;
  (e: 'checkout'): void;
  (e: 'confirm-order'): void;
  (e: 'remove-line', lineId: string): void;
  (e: 'open-adjustment', tab: 'discount' | 'surcharge' | 'tax'): void;
  (e: 'remove-discount', index?: number): void;
  (e: 'remove-surcharge', index?: number): void;
  (e: 'toggle-tax', enable: boolean): void;
}>();

const { t, locale } = useI18n();

const formatLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'vi-VN'));

const effectiveTableName = computed(() => {
  if (props.tableName && props.tableName.trim().length > 0) {
    return props.tableName;
  }
  if (props.table?.name && props.table.name.trim().length > 0) {
    return props.table.name;
  }
  return t('pos.mode.fastSale');
});

const referenceNumber = computed(() => {
  return (
    props.bill?.billNumber ||
    props.bill?.paymentRef ||
    props.session?._id ||
    ''
  );
});

const effectiveGuestCount = computed(() => {
  return props.guestCount ?? props.session?.guestCount;
});

const isDiscountEnabled = computed(() => props.billingSettings?.discountEnabled ?? true);
const isSurchargeEnabled = computed(() => props.billingSettings?.surchargeEnabled ?? true);
const isTaxEnabled = computed(() => props.billingSettings?.taxEnabled ?? true);
const allowManualTaxToggle = computed(() => props.billingSettings?.allowManualTaxToggle ?? true);
const hasTax = computed(() => Boolean(props.bill?.taxLines && props.bill.taxLines.length > 0));

const activeLines = computed(() => {
  return (props.bill?.lines ?? []).filter((l) => l.status !== 'voided');
});

const unconfirmedLines = computed(() => {
  return (props.bill?.lines ?? []).filter(
    (l) => l.status !== 'voided' && l.kdsStatus === 'unconfirmed',
  );
});

const hasUnconfirmedLines = computed(() => unconfirmedLines.value.length > 0);

const unconfirmedCount = computed(() => {
  return unconfirmedLines.value.reduce((sum, l) => sum + l.qty, 0);
});

const hasLines = computed(() => {
  return (props.bill?.lines?.length ?? 0) > 0;
});

// --- Steppers & Actions ---
function handleDecreaseQty(line: OrderLineItem) {
  if (props.readOnly || line.status === 'voided') return;
  if (line.kdsStatus === 'unconfirmed') {
    if (line.qty <= 1) {
      emit('remove-line', line.lineId);
    } else {
      emit('update-qty', line.lineId, line.qty - 1);
    }
  } else {
    if (line.qty <= 1) return;
    const nextQty = Math.max(1, line.qty - 1);
    emit('update-qty', line.lineId, nextQty);
  }
}

function handleIncreaseQty(line: OrderLineItem) {
  if (props.readOnly || line.status === 'voided') return;
  emit('update-qty', line.lineId, line.qty + 1);
}

// --- Note Dialog ---
const isNoteOpen = ref(false);
const editingLineId = ref<string | null>(null);
const noteInput = ref('');

function openNoteDialog(line: OrderLineItem) {
  if (props.readOnly || line.status === 'voided') return;
  editingLineId.value = line.lineId;
  noteInput.value = line.note ?? '';
  isNoteOpen.value = true;
}

function confirmNote() {
  if (editingLineId.value) {
    emit('set-line-note', editingLineId.value, noteInput.value.trim());
  }
  isNoteOpen.value = false;
  editingLineId.value = null;
}

// --- Void Dialog ---
const isVoidOpen = ref(false);
const voidingLineId = ref<string | null>(null);
const voidReasonInput = ref('');

function openVoidDialog(line: OrderLineItem) {
  if (props.readOnly || line.status === 'voided') return;
  voidingLineId.value = line.lineId;
  voidReasonInput.value = '';
  isVoidOpen.value = true;
}

function confirmVoid() {
  if (voidingLineId.value) {
    emit('void-line', voidingLineId.value, voidReasonInput.value.trim());
  }
  isVoidOpen.value = false;
  voidingLineId.value = null;
}

// --- Move Line Dialog ---
const isMoveDialogOpen = ref(false);
const movingLineId = ref<string | null>(null);
const selectedTargetBillId = ref<string>('');

function openMoveDialog(line: OrderLineItem) {
  if (props.readOnly || line.status === 'voided') return;
  movingLineId.value = line.lineId;
  selectedTargetBillId.value = '';
  isMoveDialogOpen.value = true;
}

function confirmMove() {
  if (movingLineId.value && selectedTargetBillId.value) {
    emit('move-line', movingLineId.value, selectedTargetBillId.value);
  }
  isMoveDialogOpen.value = false;
  movingLineId.value = null;
  selectedTargetBillId.value = '';
}
</script>

<template>
  <div class="order-ticket flex flex-col h-full bg-surface text-text select-none min-h-0" data-test="order-ticket">
    <!-- Header: Tên bàn / Bán nhanh, Số phiếu, Khách -->
    <header class="ticket-header p-3 border-b border-border flex items-center justify-between shrink-0">
      <div class="flex items-center gap-2 min-w-0">
        <h2 data-test="table-name" class="font-bold text-base text-text truncate">
          {{ effectiveTableName }}
        </h2>
        <span
          v-if="effectiveGuestCount !== undefined && effectiveGuestCount > 0"
          data-test="guest-badge"
          class="px-2 py-0.5 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0"
        >
          {{ t('pos.table.capacity', { count: effectiveGuestCount }) }}
        </span>
      </div>

      <div v-if="referenceNumber" class="text-right shrink-0">
        <span data-test="ticket-ref" class="text-xs text-text-muted font-mono block">
          {{ referenceNumber }}
        </span>
      </div>
    </header>

    <!-- Danh sách món đã gọi / đang chọn -->
    <div class="ticket-lines flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
      <div
        v-if="!hasLines"
        data-test="empty-ticket"
        class="py-16 text-center text-text-muted text-sm"
      >
        <p class="font-medium">{{ t('pos.ticket.empty') }}</p>
      </div>

      <div
        v-for="line in bill?.lines"
        :key="line.lineId"
        data-test="order-line"
        :data-line-id="line.lineId"
        class="line-item rounded-md p-2.5 transition-colors border border-border/40 hover:border-border"
        :class="{
          'opacity-60 bg-bg/50': line.status === 'voided',
          'bg-surface': line.status !== 'voided',
        }"
      >
        <!-- Hàng 1: Tên món, Kích cỡ (Variant), Thành tiền -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span
                data-test="line-name"
                class="font-medium text-sm text-text"
                :class="{ 'line-through text-text-muted': line.status === 'voided' }"
              >
                {{ line.nameSnapshot[locale as 'vi' | 'en'] || line.nameSnapshot.vi || line.nameSnapshot.en }}
              </span>

              <span
                v-if="line.variantNameSnapshot"
                data-test="line-variant"
                class="px-1.5 py-0.5 text-[10px] rounded bg-bg text-text-muted border border-border font-normal"
              >
                {{ line.variantNameSnapshot }}
              </span>

              <span
                v-if="line.status === 'voided'"
                data-test="voided-badge"
                class="px-1.5 py-0.5 text-[10px] rounded bg-danger/10 text-danger font-medium border border-danger/20"
              >
                {{ t('pos.ticket.voidedBadge') }}: {{ line.voidReason || '' }}
              </span>
              <span
                v-else-if="line.kdsStatus === 'unconfirmed'"
                data-test="line-status-badge"
                class="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold border border-amber-500/30"
              >
                <AppIcon><StopwatchOutline /></AppIcon> {{ t('pos.ticket.statusUnconfirmed') }}
              </span>
              <span
                v-else-if="line.kdsStatus === 'pending'"
                data-test="line-status-badge"
                class="px-1.5 py-0.5 text-[10px] rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 font-medium border border-blue-500/30"
              >
                <AppIcon><HourglassOutline /></AppIcon> {{ t('pos.ticket.statusPending') }}
              </span>
              <span
                v-else-if="line.kdsStatus === 'preparing'"
                data-test="line-status-badge"
                class="px-1.5 py-0.5 text-[10px] rounded bg-amber-600/15 text-amber-800 dark:text-amber-300 font-medium border border-amber-600/30 animate-pulse"
              >
                <AppIcon><FastFoodOutline /></AppIcon> {{ t('pos.ticket.statusPreparing') }}
              </span>
              <span
                v-else-if="line.kdsStatus === 'ready'"
                data-test="line-status-badge"
                class="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/30"
              >
                <AppIcon><CheckmarkCircle /></AppIcon> {{ t('pos.ticket.statusReady') }}
              </span>
            </div>

            <!-- Topping & Modifiers -->
            <ul
              v-if="line.modifiers && line.modifiers.length > 0"
              data-test="line-modifiers"
              class="text-xs text-text-muted mt-1 space-y-0.5 pl-1.5 border-l-2 border-border"
            >
              <li v-for="mod in line.modifiers" :key="mod.optionId" class="flex items-center gap-1">
                <span>+ {{ mod.groupNameSnapshot }}: {{ mod.optionNameSnapshot }}</span>
                <span v-if="mod.priceDelta.minor !== 0" class="text-primary font-medium">
                  ({{ mod.priceDelta.minor > 0 ? '+' : '' }}{{ format(mod.priceDelta, formatLocale) }})
                </span>
              </li>
            </ul>

            <!-- Combo Selections -->
            <div
              v-if="line.comboSelections && line.comboSelections.length > 0"
              data-test="line-combos"
              class="text-xs text-text-muted mt-1 pl-1.5 border-l-2 border-primary/40 space-y-0.5"
            >
              <div v-for="(combo, idx) in line.comboSelections" :key="idx" class="italic">
                <span>• {{ combo.groupKey }}: {{ combo.optionIds.join(', ') }}</span>
              </div>
            </div>

            <!-- Ghi chú món (Line Note) -->
            <div
              v-if="line.note"
              data-test="line-note"
              class="text-xs text-primary/90 italic mt-1 flex items-center gap-1"
            >
              <span><AppIcon><DocumentTextOutline /></AppIcon></span>
              <span>{{ line.note }}</span>
            </div>
          </div>

          <!-- Thành tiền của dòng -->
          <span
            data-test="line-total"
            class="font-semibold text-sm text-text whitespace-nowrap tabular-nums shrink-0"
            :class="{ 'line-through text-text-muted': line.status === 'voided' }"
          >
            {{ format(calculateLineTotal(line), formatLocale) }}
          </span>
        </div>

        <!-- Hàng 2: Bộ tăng giảm số lượng (- [ qty ] +) và Nút Ghi chú / Huỷ -->
        <div class="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-border/30">
          <div class="stepper inline-flex items-center gap-1">
            <Button.Root
              type="button"
              data-test="qty-decrease-btn"
              :disabled="props.readOnly || line.status === 'voided' || (line.kdsStatus !== 'unconfirmed' && line.qty <= 1)"
              class="btn btn-ghost px-2 py-0.5 text-xs rounded border border-border font-bold hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed"
              @click="handleDecreaseQty(line)"
            >
              -
            </Button.Root>
            <span
              data-test="line-qty"
              class="w-7 text-center text-xs font-semibold tabular-nums"
              :class="{ 'line-through text-text-muted': line.status === 'voided' }"
            >
              {{ line.qty }}
            </span>
            <Button.Root
              type="button"
              data-test="qty-increase-btn"
              :disabled="props.readOnly || line.status === 'voided'"
              class="btn btn-ghost px-2 py-0.5 text-xs rounded border border-border font-bold hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed"
              @click="handleIncreaseQty(line)"
            >
              +
            </Button.Root>
          </div>

          <div class="inline-flex items-center gap-1">
            <Button.Root
              type="button"
              data-test="line-note-btn"
              :disabled="props.readOnly || line.status === 'voided'"
              class="btn btn-ghost text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed"
              @click="openNoteDialog(line)"
            >
              {{ t('pos.ticket.note') }}
            </Button.Root>
            <Button.Root
              v-if="line.kdsStatus === 'unconfirmed'"
              type="button"
              data-test="line-remove-draft-btn"
              :disabled="props.readOnly"
              class="btn btn-ghost text-xs px-2 py-1 rounded text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed"
              :title="t('pos.ticket.deleteDraft')"
              @click="emit('remove-line', line.lineId)"
            >
              <AppIcon><Close /></AppIcon> {{ t('pos.ticket.deleteDraft') }}
            </Button.Root>
            <Button.Root
              v-else
              type="button"
              data-test="line-void-btn"
              :disabled="props.readOnly || line.status === 'voided'"
              class="btn btn-ghost text-xs px-2 py-1 rounded text-danger hover:bg-danger/10 disabled:opacity-40 disabled:cursor-not-allowed"
              @click="openVoidDialog(line)"
            >
              {{ t('pos.ticket.voidLine') }}
            </Button.Root>
            <Button.Root
              v-if="otherBills.length > 0"
              type="button"
              data-test="line-move-btn"
              :disabled="props.readOnly || line.status === 'voided'"
              class="btn btn-ghost text-xs px-2 py-1 rounded text-text-muted hover:text-text hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed"
              @click="openMoveDialog(line)"
            >
              {{ t('pos.split.moveLine') }}
            </Button.Root>
          </div>
        </div>
      </div>
    </div>

    <!-- Tóm tắt tài chính (Financial Summary) -->
    <div
      v-if="bill"
      class="ticket-summary border-t border-border p-3 space-y-1.5 text-xs bg-bg/30 shrink-0"
    >
      <!-- Tiền hàng (Subtotal) -->
      <div class="flex items-center justify-between text-text-muted">
        <span>{{ t('pos.ticket.subtotal') }}</span>
        <span data-test="ticket-subtotal" class="font-medium text-text tabular-nums">
          {{ format(bill.subtotal, formatLocale) }}
        </span>
      </div>

      <!-- Giảm giá (Discounts) -->
      <template v-if="isDiscountEnabled">
        <div
          v-if="bill.discountTotal.minor > 0 || bill.discounts.length > 0"
          class="flex items-center justify-between text-danger"
          data-test="ticket-discount-row"
        >
          <span class="flex items-center gap-1.5 flex-wrap">
            <span>{{ t('pos.ticket.discount') }}</span>
            <span
              v-for="(disc, idx) in bill.discounts"
              :key="idx"
              class="px-1.5 py-0.2 rounded bg-danger/10 text-danger text-[10px] font-medium"
            >
              {{ disc.reason || (disc.type === 'percent' ? `${disc.value}%` : '') }}
            </span>
            <button
              v-if="!props.readOnly"
              type="button"
              class="text-xs text-danger/80 hover:text-danger hover:underline font-bold px-1"
              data-test="remove-discount-btn"
              :title="t('pos.ticket.removeDiscount')"
              @click.stop="emit('remove-discount')"
            >
              <AppIcon><Close /></AppIcon>
            </button>
          </span>
          <span
            data-test="ticket-discount"
            class="font-medium tabular-nums cursor-pointer hover:underline"
            :title="t('pos.ticket.editDiscount')"
            @click="!props.readOnly && emit('open-adjustment', 'discount')"
          >
            -{{ format(bill.discountTotal, formatLocale) }}
          </span>
        </div>
        <div
          v-else-if="!props.readOnly"
          class="flex items-center justify-between text-text-muted py-0.5"
        >
          <span>{{ t('pos.ticket.discount') }}</span>
          <button
            type="button"
            data-test="add-discount-trigger"
            class="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            @click="emit('open-adjustment', 'discount')"
          >
            {{ t('pos.ticket.addDiscount') }}
          </button>
        </div>
      </template>

      <!-- Phụ thu (Surcharges) -->
      <template v-if="isSurchargeEnabled">
        <div
          v-if="bill.surchargeTotal.minor > 0 || bill.surcharges.length > 0"
          class="flex items-center justify-between text-text-muted"
          data-test="ticket-surcharge-row"
        >
          <span class="flex items-center gap-1.5 flex-wrap">
            <span>{{ t('pos.ticket.surcharge') }}</span>
            <span
              v-for="(sur, idx) in bill.surcharges"
              :key="idx"
              class="px-1.5 py-0.2 rounded bg-bg text-text text-[10px] border border-border"
            >
              {{ sur.name }}
            </span>
            <button
              v-if="!props.readOnly"
              type="button"
              class="text-xs text-text-muted hover:text-danger font-bold px-1"
              data-test="remove-surcharge-btn"
              :title="t('pos.ticket.removeSurcharge')"
              @click.stop="emit('remove-surcharge')"
            >
              <AppIcon><Close /></AppIcon>
            </button>
          </span>
          <span
            data-test="ticket-surcharge"
            class="font-medium tabular-nums cursor-pointer hover:underline"
            :title="t('pos.ticket.editSurcharge')"
            @click="!props.readOnly && emit('open-adjustment', 'surcharge')"
          >
            +{{ format(bill.surchargeTotal, formatLocale) }}
          </span>
        </div>
        <div
          v-else-if="!props.readOnly"
          class="flex items-center justify-between text-text-muted py-0.5"
        >
          <span>{{ t('pos.ticket.surcharge') }}</span>
          <button
            type="button"
            data-test="add-surcharge-trigger"
            class="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            @click="emit('open-adjustment', 'surcharge')"
          >
            {{ t('pos.ticket.addSurcharge') }}
          </button>
        </div>
      </template>

      <!-- Thuế VAT (Tax Lines) -->
      <template v-if="isTaxEnabled">
        <div
          v-for="tax in bill.taxLines"
          :key="tax.rateId"
          class="flex items-center justify-between text-text-muted"
          data-test="ticket-tax-row"
        >
          <span class="flex items-center gap-1.5">
            <span>
              {{ tax.label[locale as 'vi' | 'en'] || tax.label.vi || tax.label.en }} ({{ tax.rate }}%)
            </span>
            <span class="text-[10px] opacity-75">
              {{ bill.taxMode === 'inclusive' ? t('pos.ticket.taxInclusive') : t('pos.ticket.taxExclusive') }}
            </span>
            <button
              v-if="allowManualTaxToggle && !props.readOnly"
              type="button"
              class="text-[10px] text-danger/80 hover:text-danger hover:underline px-1"
              data-test="toggle-tax-off-btn"
              :title="t('pos.adjustments.vatToggleOff')"
              @click.stop="emit('toggle-tax', false)"
            >
              <AppIcon><Close /></AppIcon>
            </button>
          </span>
          <span
            data-test="ticket-tax"
            class="font-medium tabular-nums cursor-pointer hover:underline"
            :title="t('pos.ticket.editTax')"
            @click="!props.readOnly && emit('open-adjustment', 'tax')"
          >
            {{ bill.taxMode === 'inclusive' ? `[${format(tax.amount, formatLocale)}]` : `+${format(tax.amount, formatLocale)}` }}
          </span>
        </div>
        <div
          v-if="bill.taxLines.length === 0 && allowManualTaxToggle && !props.readOnly"
          class="flex items-center justify-between text-text-muted py-0.5"
        >
          <span>{{ t('pos.ticket.tax') }}</span>
          <button
            type="button"
            data-test="toggle-tax-on-trigger"
            class="text-[11px] text-primary hover:underline font-medium cursor-pointer"
            @click="emit('open-adjustment', 'tax')"
          >
            + {{ t('pos.adjustments.vatToggleOn') }}
          </button>
        </div>
      </template>

      <!-- Tổng thanh toán (Total) -->
      <div class="flex items-center justify-between text-sm font-bold text-text pt-1.5 border-t border-border/50">
        <span>{{ t('pos.ticket.total') }}</span>
        <span data-test="ticket-total" class="text-base tabular-nums">
          {{ format(bill.total, formatLocale) }}
        </span>
      </div>

      <!-- Số tiền còn lại phải trả (Balance Remaining) -->
      <div class="flex items-center justify-between text-xs font-bold text-primary">
        <span>{{ t('pos.payment.balanceRemaining') }}</span>
        <span data-test="ticket-balance" class="text-sm tabular-nums">
          {{ format(bill.balanceRemaining, formatLocale) }}
        </span>
      </div>
    </div>

    <!-- Nút hành động: Xác nhận gửi bếp, In tạm tính & Thanh toán -->
    <div class="ticket-actions p-3 border-t border-border flex flex-col gap-2 shrink-0">
      <!-- Nút Xác nhận gửi bếp khi có món chưa gửi -->
      <Button.Root
        v-if="hasUnconfirmedLines"
        type="button"
        data-test="confirm-order-btn"
        :disabled="props.readOnly || !hasLines"
        class="btn btn-primary text-sm py-2.5 rounded-md font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        @click="emit('confirm-order')"
      >
        <span><AppIcon><FastFoodOutline /></AppIcon></span>
        <span>{{ t('pos.ticket.sendToKitchen') }} ({{ unconfirmedCount }})</span>
      </Button.Root>

      <div class="grid grid-cols-2 gap-2">
        <Button.Root
          type="button"
          data-test="print-draft-btn"
          :disabled="props.readOnly || !hasLines || activeLines.length === 0"
          class="btn btn-ghost border border-border text-xs py-2.5 rounded-md font-medium flex items-center justify-center gap-1.5 cursor-pointer hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed"
          @click="emit('print-draft')"
        >
          <span><AppIcon><PrintOutline /></AppIcon></span>
          <span>{{ t('pos.ticket.printDraft') }}</span>
        </Button.Root>

        <Button.Root
          type="button"
          data-test="checkout-btn"
          :disabled="props.readOnly || !hasLines || activeLines.length === 0"
          class="btn text-xs py-2.5 rounded-md font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          :class="hasUnconfirmedLines ? 'btn-ghost border border-primary/50 text-primary' : 'btn-primary'"
          @click="emit('checkout')"
        >
          <span><AppIcon><CardOutline /></AppIcon></span>
          <span>{{ t('pos.ticket.checkout') }}</span>
        </Button.Root>
      </div>
    </div>

    <!-- Dialog nhập ghi chú món -->
    <Dialog.Root v-model="isNoteOpen">
      <Dialog.Content
        class="panel-card fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-[90vw] p-4 space-y-3 shadow-xl"
        data-test="note-dialog"
      >
        <Dialog.Title class="text-sm font-bold text-text">
          {{ t('pos.ticket.note') }}
        </Dialog.Title>
        <Input.Root v-model="noteInput" data-test="note-input" class="w-full">
          <Input.Control
            class="field-input w-full text-xs py-1.5 px-2"
            :placeholder="t('pos.ticket.notePlaceholder')"
            autofocus
          />
        </Input.Root>
        <div class="flex justify-end gap-2 pt-2">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1 cursor-pointer"
            @click="isNoteOpen = false"
          >
            {{ t('pos.ticket.cancel') }}
          </Button.Root>
          <Button.Root
            type="button"
            data-test="save-note-btn"
            class="btn btn-primary text-xs px-3 py-1 cursor-pointer font-medium"
            @click="confirmNote"
          >
            {{ t('pos.ticket.save') }}
          </Button.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <!-- Dialog nhập lý do huỷ món -->
    <Dialog.Root v-model="isVoidOpen">
      <Dialog.Content
        class="panel-card fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-[90vw] p-4 space-y-3 shadow-xl"
        data-test="void-dialog"
      >
        <Dialog.Title class="text-sm font-bold text-danger">
          {{ t('pos.ticket.voidLine') }}
        </Dialog.Title>
        <Input.Root v-model="voidReasonInput" data-test="void-reason-input" class="w-full">
          <Input.Control
            class="field-input w-full text-xs py-1.5 px-2"
            :placeholder="t('pos.ticket.voidReasonPlaceholder')"
            autofocus
          />
        </Input.Root>
        <div class="flex justify-end gap-2 pt-2">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1 cursor-pointer"
            @click="isVoidOpen = false"
          >
            {{ t('pos.ticket.cancel') }}
          </Button.Root>
          <Button.Root
            type="button"
            data-test="confirm-void-btn"
            class="btn btn-danger text-xs px-3 py-1 cursor-pointer font-medium"
            @click="confirmVoid"
          >
            {{ t('pos.ticket.confirmVoid') }}
          </Button.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <!-- Dialog chọn hoá đơn đích để chuyển món -->
    <Dialog.Root v-model="isMoveDialogOpen">
      <Dialog.Content
        class="panel-card fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-sm w-[90vw] p-4 space-y-3 shadow-xl"
        data-test="move-line-dialog"
      >
        <Dialog.Title class="text-sm font-bold text-text">
          {{ t('pos.split.moveLine') }}
        </Dialog.Title>

        <div class="space-y-2">
          <p class="text-xs text-text-muted">Chọn hoá đơn đích:</p>
          <div
            v-for="targetBill in otherBills"
            :key="targetBill._id"
            data-test="move-line-target"
            class="flex items-center justify-between p-2 rounded border border-border hover:bg-bg cursor-pointer"
            :class="{ 'border-primary bg-primary/5': selectedTargetBillId === targetBill._id }"
            @click="selectedTargetBillId = targetBill._id"
          >
            <span class="text-xs font-medium">{{ targetBill.billNumber }}</span>
            <span class="text-xs text-primary">{{ format(targetBill.balanceRemaining, formatLocale) }}</span>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1 cursor-pointer"
            @click="isMoveDialogOpen = false"
          >
            {{ t('pos.ticket.cancel') }}
          </Button.Root>
          <Button.Root
            type="button"
            data-test="confirm-move-btn"
            :disabled="!selectedTargetBillId"
            class="btn btn-primary text-xs px-3 py-1 cursor-pointer font-medium disabled:opacity-40"
            @click="confirmMove"
          >
            {{ t('pos.split.confirm') }}
          </Button.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  </div>
</template>
