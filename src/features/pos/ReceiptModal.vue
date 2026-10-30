<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { Close, PrintOutline } from '@vicons/ionicons5';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, Button } from '@vuetify/v0';
import ReceiptSlip, { type StoreInfo } from './ReceiptSlip.vue';
import type { BillDoc, SessionDoc } from '@/core/order/types';
import type { BankAccountDoc } from '@/core/qr/bank-account';

export type { StoreInfo };

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

const { t } = useI18n();

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
  <div class="contents">
    <Dialog.Root v-model="isOpen">
      <Dialog.Content
        class="panel-card max-w-md w-full p-0 overflow-hidden max-h-[95vh] shadow-xl m-auto"
        data-test="receipt-modal"
      >
        <div class="flex flex-col h-full max-h-[95vh]">
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
                <span><AppIcon><PrintOutline /></AppIcon></span>
                <span>{{ t('pos.receipt.print') }}</span>
              </Button.Root>
              <Button.Root
                type="button"
                data-test="close-receipt-btn"
                class="btn btn-ghost text-xs p-1.5 h-8 w-8 rounded-full cursor-pointer flex items-center justify-center text-text-muted hover:text-text"
                @click="handleClose"
              >
                <AppIcon><Close /></AppIcon>
              </Button.Root>
            </div>
          </div>

          <!-- Vùng hiển thị hoá đơn cuộn (Xem trước trên màn hình) -->
          <div class="flex-1 overflow-y-auto bg-bg p-4 flex justify-center">
            <!-- Tờ hoá đơn in nhiệt: định dạng chuẩn 80mm / 58mm -->
            <ReceiptSlip
              :bill="bill"
              :session="session"
              :table-name="tableName"
              :cashier-name="cashierName"
              :branch-name="branchName"
              :store-info="storeInfo"
              :bank-account="bankAccount"
              :paper-width="paperWidth"
              data-test="receipt-slip"
            />
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Root>

    <!-- Bản in chuyên dụng được teleport trực tiếp vào <body>, tách biệt hoàn toàn khỏi #app khi in -->
    <Teleport v-if="isOpen" to="body">
      <div
        id="openpos-print-mount"
        class="openpos-print-mount"
        :class="paperWidth === '58mm' ? 'paper-58mm' : 'paper-80mm'"
        data-test="print-mount"
      >
        <ReceiptSlip
          :bill="bill"
          :session="session"
          :table-name="tableName"
          :cashier-name="cashierName"
          :branch-name="branchName"
          :store-info="storeInfo"
          :bank-account="bankAccount"
          :paper-width="paperWidth"
          data-test="print-receipt-slip"
        />
      </div>
    </Teleport>
  </div>
</template>

<style>
/* Ẩn vùng in trên màn hình xem thông thường */
@media screen {
  #openpos-print-mount {
    display: none !important;
  }
}

/* Định dạng in ấn sạch sẽ, không lặp lại trang, tương thích máy in nhiệt 80mm & 58mm */
@media print {
  /* 1. Ẩn toàn bộ các phần tử trực tiếp của <body> ngoại trừ vùng in chuyên dụng #openpos-print-mount */
  body > :not(#openpos-print-mount) {
    display: none !important;
  }

  /* 2. Reset html & body: loại bỏ mọi margin, padding, thanh cuộn và layout flex/grid của màn hình */
  html,
  body {
    margin: 0 !important;
    padding: 0 !important;
    background: #ffffff !important;
    color: #000000 !important;
    width: 100% !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
  }

  /* 3. Hiển thị khung in trong luồng văn bản tự nhiên (position: static).
        TUYỆT ĐỐI KHÔNG DÙNG position: fixed vì CSS paged media sẽ lặp lại phần tử trên mọi trang! */
  #openpos-print-mount {
    display: block !important;
    position: static !important;
    margin: 0 auto !important;
    padding: 0 !important;
    width: 80mm !important;
    max-width: 80mm !important;
    background: #ffffff !important;
    color: #000000 !important;
    box-sizing: border-box !important;
  }

  #openpos-print-mount.paper-58mm {
    width: 58mm !important;
    max-width: 58mm !important;
  }

  #openpos-print-mount .receipt-slip {
    position: static !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 2mm 1mm !important;
    box-sizing: border-box !important;
    border: none !important;
    box-shadow: none !important;
    background: #ffffff !important;
    color: #000000 !important;
  }

  .no-print {
    display: none !important;
  }

  @page {
    margin: 0;
    size: auto;
  }
}
</style>
