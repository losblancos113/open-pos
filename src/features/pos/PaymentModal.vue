<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { Close } from '@vicons/ionicons5';
import { ref, computed, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input } from '@vuetify/v0';
import { format, money, type Money } from '@/core/money';
import { buildVietQrPayload, generateVietQrPayload, type VietQrInput } from '@/core/qr/vietqr';
import { generateQrSvg } from '@/core/qr/qr-matrix';
import { recalculateBill } from '@/core/order/reducer';
import type { BillDoc, PaymentEntry, PaymentMethod } from '@/core/order/types';
import type { BankAccountDoc } from '@/core/qr/bank-account';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    bill?: BillDoc | null;
    bankAccount?: BankAccountDoc | null;
  }>(),
  {
    open: false,
    modelValue: false,
    bill: null,
    bankAccount: null,
  },
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'update:modelValue', val: boolean): void;
  (e: 'open-bank-settings'): void;
  (e: 'payment-added', payment: PaymentEntry): void;
  (e: 'complete', bill: BillDoc): void;
  (e: 'close'): void;
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

type PaymentTab = 'cash' | 'vietqr' | 'card' | 'other';
const activeTab = ref<PaymentTab>('cash');

const currency = computed(() => props.bill?.total?.currency ?? 'VND');

// --- Amount to Pay & Cash Inputs ---
const amountToPayInput = ref<string>('');
const tenderedInput = ref<string>('');
const cardRefInput = ref<string>('');
const otherNoteInput = ref<string>('');

const currentBalanceMinor = computed(() => {
  return props.bill?.balanceRemaining?.minor ?? props.bill?.total?.minor ?? 0;
});

const formattedBalanceRemaining = computed(() => {
  return format(money(currentBalanceMinor.value, currency.value), formatLocale.value);
});

watch(
  [() => props.bill?.balanceRemaining?.minor, isOpen],
  ([balanceMinor, open]) => {
    if (open && typeof balanceMinor === 'number') {
      amountToPayInput.value = String(balanceMinor);
      tenderedInput.value = String(balanceMinor);
    }
  },
  { immediate: true },
);

const amountToPay = computed(() => {
  const parsed = parseInt(amountToPayInput.value, 10);
  if (isNaN(parsed) || parsed < 0) return 0;
  return Math.min(parsed, currentBalanceMinor.value);
});

// --- Cash Tab State ---
const tenderedAmount = computed(() => {
  const parsed = parseInt(tenderedInput.value, 10);
  if (isNaN(parsed) || parsed < 0) return 0;
  return parsed;
});

const changeAmount = computed(() => {
  return Math.max(0, tenderedAmount.value - amountToPay.value);
});

const formattedChange = computed(() => {
  return format(money(changeAmount.value, currency.value), formatLocale.value);
});

const isTenderedInsufficient = computed(() => {
  return tenderedAmount.value < amountToPay.value;
});

function setDenomination(value: number) {
  tenderedInput.value = String(value);
}

// --- VietQR Tab State ---
const isBankConfigured = computed(() => {
  return Boolean(
    props.bankAccount?.bankBin &&
      props.bankAccount.bankBin.trim().length === 6 &&
      props.bankAccount?.accountNumber &&
      props.bankAccount.accountNumber.trim().length > 0,
  );
});

const vietQrPayload = ref<string | null>(null);
let qrAbort: AbortController | null = null;

function buildVietQrInput(): VietQrInput | null {
  if (!isBankConfigured.value || !props.bankAccount || !props.bill) return null;
  return {
    bankBin: props.bankAccount.bankBin,
    accountNumber: props.bankAccount.accountNumber,
    accountName: props.bankAccount.accountName,
    ...(amountToPay.value > 0 ? { amount: money(amountToPay.value, currency.value) } : {}),
    paymentRef: props.bill.paymentRef,
  };
}

watch(
  () => [
    isBankConfigured.value,
    props.bankAccount?.bankBin,
    props.bankAccount?.accountNumber,
    props.bankAccount?.accountName,
    amountToPay.value,
    props.bill?.paymentRef,
  ],
  () => {
    qrAbort?.abort();
    qrAbort = null;

    const input = buildVietQrInput();
    if (!input) {
      vietQrPayload.value = null;
      return;
    }

    // Hiện mã offline ngay để không có trạng thái "đang tải QR" (Spec R9).
    try {
      vietQrPayload.value = buildVietQrPayload(input);
    } catch {
      vietQrPayload.value = null;
      return;
    }

    // Gọi API song song; chỉ thay mã khi thành công.
    const controller = new AbortController();
    qrAbort = controller;
    generateVietQrPayload(input, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        vietQrPayload.value = result.qrCode;
      })
      .catch(() => {
        // Mã offline vẫn đang hiển thị.
      });
  },
  { immediate: true },
);

onUnmounted(() => {
  qrAbort?.abort();
  qrAbort = null;
});

const qrSvg = computed(() => {
  if (!vietQrPayload.value) return '';
  try {
    return generateQrSvg(vietQrPayload.value, { size: 220, margin: 2 });
  } catch {
    return '';
  }
});

const isCopied = ref(false);
async function copyTransferContent() {
  if (!props.bill?.paymentRef) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(props.bill.paymentRef);
      isCopied.value = true;
      setTimeout(() => {
        isCopied.value = false;
      }, 2000);
    }
  } catch {
    // Clipboard fallback
  }
}

// --- Validation & Confirm Payment ---
const canConfirmPayment = computed(() => {
  if (amountToPay.value <= 0 || amountToPay.value > currentBalanceMinor.value) {
    return false;
  }
  if (activeTab.value === 'cash' && isTenderedInsufficient.value) {
    return false;
  }
  if (activeTab.value === 'vietqr' && !isBankConfigured.value) {
    return false;
  }
  return true;
});

function handleConfirmPayment() {
  if (!props.bill) return;
  if (!canConfirmPayment.value) return;

  let method: PaymentMethod = 'cash';
  let refStr: string | undefined = undefined;
  let tendered: Money | undefined = undefined;
  let change: Money | undefined = undefined;

  if (activeTab.value === 'cash') {
    if (isTenderedInsufficient.value) return;
    method = 'cash';
    tendered = money(tenderedAmount.value, currency.value);
    change = money(changeAmount.value, currency.value);
  } else if (activeTab.value === 'vietqr') {
    if (!isBankConfigured.value) return;
    method = 'bank_transfer';
    refStr = props.bill.paymentRef;
  } else if (activeTab.value === 'card') {
    method = 'card';
    const trimmed = cardRefInput.value.trim();
    if (trimmed) refStr = trimmed;
  } else if (activeTab.value === 'other') {
    method = 'other';
    const trimmed = otherNoteInput.value.trim();
    if (trimmed) refStr = trimmed;
  }

  const paymentAmount = money(amountToPay.value, currency.value);
  const paymentId = `pay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();

  const entry: PaymentEntry = {
    paymentId,
    method,
    amount: paymentAmount,
    ...(tendered ? { tendered } : {}),
    ...(change ? { change } : {}),
    ...(refStr ? { ref: refStr } : {}),
    createdAt,
  };

  emit('payment-added', entry);

  // Check if balance cleared
  if (currentBalanceMinor.value - paymentAmount.minor <= 0) {
    const updatedPayments = [...(props.bill.payments ?? []), entry];
    const paidBill: BillDoc = recalculateBill({
      ...props.bill,
      status: 'paid',
      paidAt: createdAt,
      payments: updatedPayments,
      updatedAt: createdAt,
    });
    emit('complete', paidBill);
    isOpen.value = false;
  }
}

defineExpose({
  activeTab,
  amountToPay,
  tenderedAmount,
  changeAmount,
  isTenderedInsufficient,
  isBankConfigured,
  vietQrPayload,
  qrSvg,
  setDenomination,
  handleConfirmPayment,
  canConfirmPayment,
});
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-lg w-full p-6 space-y-4 max-h-[92vh] overflow-y-auto m-auto"
      data-test="payment-modal"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-border pb-3">
        <div>
          <Dialog.Title class="text-base font-bold text-text">
            {{ t('pos.payment.title') }}
          </Dialog.Title>
          <Dialog.Description class="text-xs text-text-muted mt-0.5">
            {{ bill?.billNumber }}
          </Dialog.Description>
        </div>
        <Button.Root
          type="button"
          data-test="close-modal-btn"
          class="btn btn-ghost text-xs p-1 h-7 w-7 rounded-full cursor-pointer flex items-center justify-center text-text-muted hover:text-text"
          @click="isOpen = false"
        >
          <AppIcon><Close /></AppIcon>
        </Button.Root>
      </div>

      <!-- Banner tổng tiền còn lại & thanh toán từng phần (Split Payment) -->
      <div class="p-3.5 rounded-lg bg-primary/10 border border-primary/20 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="text-xs text-text-muted font-medium">{{ t('pos.payment.balanceRemaining') }}</div>
          <div data-test="balance-remaining" class="text-xl font-bold text-primary">
            {{ formattedBalanceRemaining }}
          </div>
        </div>

        <div class="w-44 text-right">
          <label class="block text-xs text-text-muted mb-1">{{ t('pos.payment.amountToPay') }}</label>
          <Input.Root v-model="amountToPayInput" data-test="amount-to-pay-input">
            <Input.Control
              type="number"
              class="field-input text-right font-semibold text-sm py-1 px-2 w-full"
              :placeholder="t('pos.payment.amountToPay')"
              :max="currentBalanceMinor"
              min="0"
              step="1000"
            />
          </Input.Root>
        </div>
      </div>

      <!-- Tabs chọn phương thức thanh toán -->
      <Button.Group
        v-model="activeTab"
        mandatory
        class="flex gap-1 rounded-md bg-bg p-1 border border-border shadow-xs"
        data-test="payment-tabs"
      >
        <Button.Root
          type="button"
          value="cash"
          data-test="tab-cash"
          class="flex-1 cursor-pointer rounded-sm py-1.5 text-xs font-medium text-text-muted text-center [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t('pos.payment.cash') }}
        </Button.Root>
        <Button.Root
          type="button"
          value="vietqr"
          data-test="tab-vietqr"
          class="flex-1 cursor-pointer rounded-sm py-1.5 text-xs font-medium text-text-muted text-center [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t('pos.payment.vietqr') }}
        </Button.Root>
        <Button.Root
          type="button"
          value="card"
          data-test="tab-card"
          class="flex-1 cursor-pointer rounded-sm py-1.5 text-xs font-medium text-text-muted text-center [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t('pos.payment.card') }}
        </Button.Root>
        <Button.Root
          type="button"
          value="other"
          data-test="tab-other"
          class="flex-1 cursor-pointer rounded-sm py-1.5 text-xs font-medium text-text-muted text-center [&:not([data-selected])]:hover:text-text selected:(bg-primary text-primary-contrast shadow-sm) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {{ t('pos.payment.other') }}
        </Button.Root>
      </Button.Group>

      <!-- Nội dung tab Tiền mặt -->
      <div v-if="activeTab === 'cash'" class="space-y-3.5" data-test="cash-panel">
        <!-- Bàn phím mệnh giá tiền mặt nhanh -->
        <div class="space-y-1">
          <span class="text-xs font-medium text-text-muted">Mệnh giá tiền:</span>
          <div class="grid grid-cols-5 gap-2">
            <Button.Root
              type="button"
              data-test="denom-50k"
              class="btn btn-ghost border border-border text-xs py-2 text-center font-semibold rounded cursor-pointer hover:bg-bg"
              @click="setDenomination(50000)"
            >
              50.000
            </Button.Root>
            <Button.Root
              type="button"
              data-test="denom-100k"
              class="btn btn-ghost border border-border text-xs py-2 text-center font-semibold rounded cursor-pointer hover:bg-bg"
              @click="setDenomination(100000)"
            >
              100.000
            </Button.Root>
            <Button.Root
              type="button"
              data-test="denom-200k"
              class="btn btn-ghost border border-border text-xs py-2 text-center font-semibold rounded cursor-pointer hover:bg-bg"
              @click="setDenomination(200000)"
            >
              200.000
            </Button.Root>
            <Button.Root
              type="button"
              data-test="denom-500k"
              class="btn btn-ghost border border-border text-xs py-2 text-center font-semibold rounded cursor-pointer hover:bg-bg"
              @click="setDenomination(500000)"
            >
              500.000
            </Button.Root>
            <Button.Root
              type="button"
              data-test="denom-exact"
              class="btn btn-ghost border border-border text-xs py-2 text-center font-semibold rounded cursor-pointer hover:bg-bg"
              @click="setDenomination(amountToPay)"
            >
              {{ t('pos.payment.exact') }}
            </Button.Root>
          </div>
        </div>

        <!-- Ô nhập tiền khách đưa tuỳ chỉnh -->
        <div class="space-y-1">
          <label class="block text-xs font-medium text-text-muted">
            {{ t('pos.payment.tendered') }}
          </label>
          <Input.Root v-model="tenderedInput" data-test="tendered-input">
            <Input.Control
              type="number"
              class="field-input w-full text-base font-semibold py-2 px-3"
              :placeholder="t('pos.payment.tendered')"
            />
          </Input.Root>
          <p
            v-if="isTenderedInsufficient"
            data-test="tendered-error"
            class="text-xs text-danger font-medium mt-1"
          >
            {{ t('pos.payment.insufficientTendered') }}
          </p>
        </div>

        <!-- Tiền thừa trả lại -->
        <div class="flex items-center justify-between p-3 rounded-md bg-bg border border-border">
          <span class="text-xs font-medium text-text-muted">{{ t('pos.payment.change') }}:</span>
          <span data-test="change-amount" class="text-lg font-bold text-success">
            {{ formattedChange }}
          </span>
        </div>
      </div>

      <!-- Nội dung tab VietQR -->
      <div v-else-if="activeTab === 'vietqr'" class="space-y-3" data-test="vietqr-panel">
        <div
          v-if="!isBankConfigured"
          data-test="vietqr-missing-account"
          class="p-4 rounded-md bg-warning/10 border border-warning/30 text-center space-y-3"
        >
          <p class="text-xs font-medium text-warning-contrast">
            {{ t('pos.payment.missingBankConfig') }}
          </p>
          <Button.Root
            type="button"
            data-test="open-bank-settings-btn"
            class="btn btn-primary text-xs px-3 py-1.5 cursor-pointer font-medium"
            @click="emit('open-bank-settings')"
          >
            {{ t('pos.payment.configureBank') }}
          </Button.Root>
        </div>

        <div v-else class="space-y-3">
          <!-- Hiển thị mã QR SVG -->
          <div
            data-test="vietqr-svg"
            class="flex justify-center items-center p-3 bg-white rounded-md border border-border min-h-[220px]"
            v-html="qrSvg"
          />

          <!-- Thông tin chuyển khoản & nút sao chép nội dung -->
          <div class="space-y-2 text-xs">
            <div class="flex items-center justify-between p-2.5 rounded bg-bg border border-border">
              <div>
                <div class="text-text-muted">{{ t('pos.payment.transferContent') }}:</div>
                <div data-test="transfer-content" class="font-bold text-sm text-primary tracking-wider">
                  {{ bill?.paymentRef }}
                </div>
              </div>
              <Button.Root
                type="button"
                data-test="copy-ref-btn"
                class="btn btn-ghost text-xs px-2.5 py-1.5 cursor-pointer flex items-center gap-1 border border-border rounded"
                @click="copyTransferContent"
              >
                <span>{{ isCopied ? t('pos.payment.copied') : t('pos.payment.copyRef') }}</span>
              </Button.Root>
            </div>

            <div class="p-2.5 rounded bg-bg border border-border grid grid-cols-2 gap-2">
              <div>
                <span class="text-text-muted">{{ t('pos.bank.bankName') }}: </span>
                <span class="font-semibold text-text">{{ bankAccount?.bankName }}</span>
              </div>
              <div>
                <span class="text-text-muted">{{ t('pos.bank.accountNumber') }}: </span>
                <span class="font-semibold text-text">{{ bankAccount?.accountNumber }}</span>
              </div>
              <div class="col-span-2">
                <span class="text-text-muted">{{ t('pos.bank.accountName') }}: </span>
                <span class="font-semibold uppercase text-text">{{ bankAccount?.accountName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Nội dung tab Thẻ ngân hàng -->
      <div v-else-if="activeTab === 'card'" class="space-y-3" data-test="card-panel">
        <div class="space-y-1">
          <label class="block text-xs font-medium text-text-muted">
            {{ t('pos.payment.cardRefPlaceholder') }}
          </label>
          <Input.Root v-model="cardRefInput" data-test="card-ref-input">
            <Input.Control
              class="field-input w-full text-xs py-2 px-3"
              :placeholder="t('pos.payment.cardRefPlaceholder')"
            />
          </Input.Root>
        </div>
      </div>

      <!-- Nội dung tab Khác -->
      <div v-else-if="activeTab === 'other'" class="space-y-3" data-test="other-panel">
        <div class="space-y-1">
          <label class="block text-xs font-medium text-text-muted">
            {{ t('pos.payment.otherNotePlaceholder') }}
          </label>
          <Input.Root v-model="otherNoteInput" data-test="other-note-input">
            <Input.Control
              class="field-input w-full text-xs py-2 px-3"
              :placeholder="t('pos.payment.otherNotePlaceholder')"
            />
          </Input.Root>
        </div>
      </div>

      <!-- Footer: nút huỷ và nút xác nhận đã nhận tiền -->
      <div class="flex justify-end gap-2 pt-3 border-t border-border">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-3 py-2 cursor-pointer"
          @click="isOpen = false"
        >
          {{ t('common.cancel') }}
        </Button.Root>
        <Button.Root
          type="button"
          data-test="confirm-payment-btn"
          class="btn btn-primary text-xs px-4 py-2 cursor-pointer font-bold shadow-sm"
          :disabled="!canConfirmPayment"
          @click="handleConfirmPayment"
        >
          {{ t('pos.payment.confirmReceived') }}
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
