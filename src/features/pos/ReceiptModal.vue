<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, Button } from '@vuetify/v0';
import { format, money } from '@/core/money';
import { calculateLineTotal } from '@/core/order/reducer';
import { buildVietQrPayload } from '@/core/qr/vietqr';
import { generateQrSvg } from '@/core/qr/qr-matrix';
import type { BillDoc, SessionDoc, OrderLineItem } from '@/core/order/types';
import type { BankAccountDoc } from '@/core/qr/bank-account';

export interface StoreInfo {
  name?: string;
  address?: string;
  phone?: string;
}

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    bill?: BillDoc | null;
    session?: SessionDoc | null;
    tableName?: string;
    cashierName?: string;
    branchName?: string;
    storeInfo?: StoreInfo | null;
    bankAccount?: BankAccountDoc | null;
    paperWidth?: '80mm' | '58mm';
  }>(),
  {
    open: false,
    modelValue: false,
    bill: null,
    session: null,
    tableName: '',
    cashierName: '',
    branchName: '',
    storeInfo: null,
    bankAccount: null,
    paperWidth: '80mm',
  },
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'update:modelValue', val: boolean): void;
  (e: 'close'): void;
  (e: 'print'): void;
}>();

const { t, locale } = useI18n();

const formatLocale = computed(() => (locale.value === 'en' ? 'en-US' : 'vi-VN'));

const isOpen = computed({
  get: () => props.open || props.modelValue,
  set: (val: boolean) => {
    emit('update:open', val);
    emit('update:modelValue', val);
    if (!val) {
      emit('close');
    }
  },
});

const currency = computed(() => props.bill?.total?.currency ?? 'VND');

const storeName = computed(() => props.storeInfo?.name || 'Open POS');
const storePhone = computed(() => props.storeInfo?.phone || '');
const storeAddress = computed(() => props.storeInfo?.address || '');
const storeBranch = computed(() => {
  if (props.branchName && props.branchName.trim().length > 0) {
    return props.branchName;
  }
  if (props.bill?.branchId) {
    return props.bill.branchId.toUpperCase();
  }
  return '';
});

const effectiveCashierName = computed(() => {
  if (props.cashierName && props.cashierName.trim().length > 0) {
    return props.cashierName;
  }
  if (props.session?.openedBy && props.session.openedBy.trim().length > 0) {
    return props.session.openedBy;
  }
  return t('pos.receipt.cashier');
});

const effectiveTableName = computed(() => {
  if (props.tableName && props.tableName.trim().length > 0) {
    return props.tableName;
  }
  return t('pos.receipt.fastSale');
});

const formattedDate = computed(() => {
  const raw = props.bill?.paidAt || props.bill?.createdAt;
  const d = raw ? new Date(raw) : new Date();
  try {
    return d.toLocaleString(formatLocale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d.toISOString();
  }
});

const activeLines = computed(() => {
  return (props.bill?.lines ?? []).filter((line) => line.status !== 'voided');
});

function getLineName(line: OrderLineItem): string {
  if (!line.nameSnapshot) return '';
  if (typeof line.nameSnapshot === 'string') return line.nameSnapshot;
  if (locale.value === 'en' && line.nameSnapshot.en) {
    return line.nameSnapshot.en;
  }
  return line.nameSnapshot.vi || line.nameSnapshot.en || '';
}

function getLineTotal(line: OrderLineItem) {
  return calculateLineTotal(line);
}

const shouldShowVietQr = computed(() => {
  if (!props.bankAccount || !props.bill) return false;
  const isUnpaid =
    (props.bill.balanceRemaining?.minor ?? 0) > 0 || props.bill.status !== 'paid';
  const hasBankPayment = props.bill.payments?.some((p) => p.method === 'bank_transfer');
  return isUnpaid || hasBankPayment;
});

const vietQrPayload = computed(() => {
  if (!shouldShowVietQr.value || !props.bankAccount || !props.bill) return null;
  try {
    const unpaidMinor =
      props.bill.balanceRemaining?.minor ?? props.bill.total?.minor ?? 0;
    return buildVietQrPayload({
      bankBin: props.bankAccount.bankBin,
      accountNumber: props.bankAccount.accountNumber,
      ...(unpaidMinor > 0 ? { amount: money(unpaidMinor, currency.value) } : {}),
      paymentRef: props.bill.paymentRef,
    });
  } catch {
    return null;
  }
});

const qrSvg = computed(() => {
  if (!vietQrPayload.value) return '';
  try {
    return generateQrSvg(vietQrPayload.value, { size: 130, margin: 1 });
  } catch {
    return '';
  }
});

function handlePrint() {
  emit('print');
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

function handleClose() {
  isOpen.value = false;
}
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-md w-full p-0 overflow-hidden flex flex-col max-h-[95vh] shadow-xl"
      data-test="receipt-modal"
    >
      <!-- Dialog Action Header (Ẩn khi in ấn) -->
      <div
        class="no-print flex items-center justify-between px-4 py-3 border-b border-border bg-surface"
      >
        <div>
          <Dialog.Title class="text-sm font-bold text-text">
            {{ t('pos.receipt.title') }}
          </Dialog.Title>
          <Dialog.Description class="text-xs text-text-muted">
            {{ bill?.billNumber }}
          </Dialog.Description>
        </div>
        <div class="flex items-center gap-2">
          <Button.Root
            type="button"
            data-test="print-btn"
            class="btn btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 cursor-pointer shadow-sm"
            @click="handlePrint"
          >
            <span>🖨️</span>
            <span>{{ t('pos.receipt.print') }}</span>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="close-receipt-btn"
            class="btn btn-ghost text-xs p-1.5 h-8 w-8 rounded-full cursor-pointer flex items-center justify-center text-text-muted hover:text-text"
            @click="handleClose"
          >
            ✕
          </Button.Root>
        </div>
      </div>

      <!-- Vùng hiển thị hoá đơn cuộn (Xem trước trên màn hình) -->
      <div class="flex-1 overflow-y-auto bg-bg p-4 flex justify-center">
        <!-- Tờ hoá đơn in nhiệt: định dạng chuẩn 80mm / 58mm -->
        <div
          class="receipt-slip bg-surface text-text p-4 shadow-sm font-mono text-xs border border-border"
          :class="paperWidth === '58mm' ? 'paper-58mm max-w-[240px]' : 'paper-80mm max-w-[320px] w-full'"
          data-test="receipt-slip"
        >
          <!-- Store Header -->
          <div class="store-header text-center space-y-1 pb-3 border-b border-dashed border-border">
            <h2
              class="text-sm font-bold tracking-tight uppercase"
              data-test="store-name"
            >
              {{ storeName }}
            </h2>
            <div
              v-if="storeBranch"
              class="text-[11px] text-text-muted"
              data-test="store-branch"
            >
              {{ t('pos.receipt.branch') }}: {{ storeBranch }}
            </div>
            <div
              v-if="storeAddress"
              class="text-[11px] text-text-muted"
              data-test="store-address"
            >
              {{ storeAddress }}
            </div>
            <div
              v-if="storePhone"
              class="text-[11px] text-text-muted"
              data-test="store-phone"
            >
              {{ t('pos.receipt.phone') }}: {{ storePhone }}
            </div>
          </div>

          <!-- Bill Metadata -->
          <div class="bill-metadata py-2.5 space-y-1 border-b border-dashed border-border text-[11px]">
            <div class="text-center font-bold text-xs uppercase mb-1.5 tracking-wider">
              {{ t('pos.receipt.header') }}
            </div>
            <div class="flex justify-between" data-test="receipt-bill-number">
              <span class="text-text-muted">{{ t('pos.receipt.billNumber') }}:</span>
              <span class="font-semibold">{{ bill?.billNumber }}</span>
            </div>
            <div class="flex justify-between" data-test="receipt-date">
              <span class="text-text-muted">{{ t('pos.receipt.date') }}:</span>
              <span>{{ formattedDate }}</span>
            </div>
            <div class="flex justify-between" data-test="receipt-table">
              <span class="text-text-muted">{{ t('pos.receipt.table') }}:</span>
              <span class="font-semibold">{{ effectiveTableName }}</span>
            </div>
            <div class="flex justify-between" data-test="receipt-cashier">
              <span class="text-text-muted">{{ t('pos.receipt.cashier') }}:</span>
              <span>{{ effectiveCashierName }}</span>
            </div>
          </div>

          <!-- Itemized Lines -->
          <div class="line-items py-2.5 border-b border-dashed border-border">
            <table class="w-full text-left">
              <thead>
                <tr class="border-b border-border/50 text-[10px] uppercase text-text-muted">
                  <th class="py-1">{{ t('pos.receipt.item') }}</th>
                  <th class="py-1 text-center w-8">{{ t('pos.receipt.qty') }}</th>
                  <th class="py-1 text-right w-16">{{ t('pos.receipt.price') }}</th>
                  <th class="py-1 text-right w-18">{{ t('pos.receipt.amount') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-border/30">
                <template v-for="line in activeLines" :key="line.lineId">
                  <tr class="align-top">
                    <td class="py-1.5 pr-1">
                      <div class="font-medium text-xs">{{ getLineName(line) }}</div>
                      <!-- Variant badge -->
                      <div
                        v-if="line.variantNameSnapshot"
                        class="text-[10px] text-text-muted"
                      >
                        [{{ line.variantNameSnapshot }}]
                      </div>
                      <!-- Modifiers -->
                      <div
                        v-for="mod in line.modifiers"
                        :key="mod.optionId"
                        class="text-[10px] text-text-muted pl-1"
                      >
                        + {{ mod.groupNameSnapshot }}: {{ mod.optionNameSnapshot }}
                        <span v-if="mod.priceDelta && mod.priceDelta.minor > 0">
                          (+{{ format(mod.priceDelta, formatLocale) }})
                        </span>
                      </div>
                      <!-- Combo child selections -->
                      <div
                        v-for="combo in line.comboSelections"
                        :key="combo.groupKey"
                        class="text-[10px] text-text-muted pl-1"
                      >
                        • {{ combo.groupKey }}: {{ combo.optionIds.join(', ') }}
                      </div>
                      <!-- Line Note -->
                      <div
                        v-if="line.note"
                        class="text-[10px] italic text-text-muted pl-1"
                      >
                        * {{ line.note }}
                      </div>
                    </td>
                    <td class="py-1.5 text-center font-medium">{{ line.qty }}</td>
                    <td class="py-1.5 text-right text-text-muted">
                      {{ format(line.unitPriceSnapshot, formatLocale) }}
                    </td>
                    <td class="py-1.5 text-right font-medium">
                      {{ format(getLineTotal(line), formatLocale) }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Financial Totals -->
          <div class="financial-totals py-2.5 space-y-1.5 border-b border-dashed border-border text-[11px]">
            <!-- Subtotal -->
            <div class="flex justify-between" data-test="receipt-subtotal">
              <span class="text-text-muted">{{ t('pos.receipt.subtotal') }}:</span>
              <span class="font-medium">
                {{ bill ? format(bill.subtotal, formatLocale) : '0' }}
              </span>
            </div>

            <!-- Discounts -->
            <template v-if="bill && bill.discountTotal && bill.discountTotal.minor > 0">
              <div
                v-for="(disc, idx) in bill.discounts"
                :key="idx"
                class="flex justify-between text-text-muted"
                data-test="receipt-discount"
              >
                <span>
                  {{ t('pos.receipt.discount') }}
                  <span v-if="disc.reason">({{ disc.reason }})</span>:
                </span>
                <span>
                  -{{
                    disc.type === 'percent'
                      ? `${disc.value}%`
                      : format(money(disc.value, currency), formatLocale)
                  }}
                </span>
              </div>
            </template>

            <!-- Surcharges -->
            <template v-if="bill && bill.surchargeTotal && bill.surchargeTotal.minor > 0">
              <div
                v-for="(sur, idx) in bill.surcharges"
                :key="idx"
                class="flex justify-between text-text-muted"
                data-test="receipt-surcharge"
              >
                <span>
                  {{ sur.name || t('pos.receipt.surcharge') }}:
                </span>
                <span>
                  +{{
                    sur.ratePercent
                      ? `${sur.ratePercent}%`
                      : sur.fixedAmount
                        ? format(sur.fixedAmount, formatLocale)
                        : format(bill.surchargeTotal, formatLocale)
                  }}
                </span>
              </div>
            </template>

            <!-- Tax lines -->
            <template v-if="bill && bill.taxLines && bill.taxLines.length > 0">
              <div
                v-for="tax in bill.taxLines"
                :key="tax.rateId"
                class="flex justify-between text-text-muted"
                data-test="receipt-tax"
              >
                <span>
                  {{ tax.label ? (locale === 'en' ? tax.label.en : tax.label.vi) : t('pos.receipt.tax') }}
                  ({{ tax.rate }}%):
                </span>
                <span>{{ format(tax.amount, formatLocale) }}</span>
              </div>
            </template>

            <!-- Grand Total -->
            <div
              class="flex justify-between text-sm font-bold pt-1 border-t border-border/40"
              data-test="receipt-total"
            >
              <span>{{ t('pos.receipt.total') }}:</span>
              <span class="text-base">
                {{ bill ? format(bill.total, formatLocale) : '0' }}
              </span>
            </div>
          </div>

          <!-- Payment Breakdown -->
          <div
            v-if="bill && bill.payments && bill.payments.length > 0"
            class="payment-breakdown py-2.5 space-y-1 border-b border-dashed border-border text-[11px]"
            data-test="receipt-payments"
          >
            <div class="font-bold text-xs mb-1">
              {{ t('pos.receipt.payment') }}
            </div>
            <div
              v-for="payment in bill.payments"
              :key="payment.paymentId"
              class="space-y-0.5"
            >
              <div class="flex justify-between">
                <span>
                  {{
                    payment.method === 'cash'
                      ? t('pos.payment.cash')
                      : payment.method === 'bank_transfer'
                        ? t('pos.payment.vietqr')
                        : payment.method === 'card'
                          ? t('pos.payment.card')
                          : t('pos.payment.other')
                  }}:
                </span>
                <span class="font-medium">{{ format(payment.amount, formatLocale) }}</span>
              </div>
              <div
                v-if="payment.method === 'cash' && payment.tendered"
                class="flex justify-between text-text-muted pl-2"
              >
                <span>{{ t('pos.receipt.tendered') }}:</span>
                <span>{{ format(payment.tendered, formatLocale) }}</span>
              </div>
              <div
                v-if="payment.method === 'cash' && payment.change"
                class="flex justify-between text-text-muted pl-2"
              >
                <span>{{ t('pos.receipt.change') }}:</span>
                <span>{{ format(payment.change, formatLocale) }}</span>
              </div>
              <div
                v-if="payment.ref"
                class="flex justify-between text-text-muted pl-2 text-[10px]"
              >
                <span>{{ t('pos.receipt.transferRef') }}:</span>
                <span>{{ payment.ref }}</span>
              </div>
            </div>
          </div>

          <!-- VietQR SVG (nếu chưa thanh toán xong hoặc thanh toán chuyển khoản) -->
          <div
            v-if="shouldShowVietQr && qrSvg"
            class="vietqr-container py-3 flex flex-col items-center justify-center border-b border-dashed border-border"
            data-test="receipt-vietqr"
          >
            <div class="text-[10px] text-text-muted font-medium mb-1">
              {{ t('pos.receipt.scanToPay') }}
            </div>
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="qr-svg-wrapper bg-white p-1 rounded" v-html="qrSvg" />
            <div class="text-[10px] font-mono mt-1 font-semibold">
              {{ bill?.paymentRef }}
            </div>
          </div>

          <!-- Footer Thank You Note -->
          <div class="receipt-footer text-center pt-3 text-[11px] text-text-muted space-y-1">
            <p class="font-medium">{{ t('pos.receipt.thankYou') }}</p>
            <p class="text-[10px] tracking-widest text-text-muted/60">*** OPEN POS ***</p>
          </div>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>

<style scoped>
@media print {
  /* Ẩn toàn bộ thành phần giao diện không liên quan */
  :global(body *) {
    visibility: hidden !important;
  }

  /* Chỉ hiển thị phần receipt-slip và con của nó */
  .receipt-slip,
  .receipt-slip * {
    visibility: visible !important;
  }

  .receipt-slip {
    position: fixed !important;
    left: 0 !important;
    top: 0 !important;
    margin: 0 !important;
    padding: 2mm !important;
    width: 80mm !important;
    max-width: 80mm !important;
    background: #ffffff !important;
    color: #000000 !important;
    box-shadow: none !important;
    border: none !important;
    z-index: 999999 !important;
  }

  .receipt-slip.paper-58mm {
    width: 58mm !important;
    max-width: 58mm !important;
  }

  .no-print {
    display: none !important;
  }

  @page {
    size: 80mm auto;
    margin: 0;
  }
}
</style>
