<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { Close, NotificationsOutline, PricetagOutline, ReceiptOutline } from '@vicons/ionicons5';
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input } from '@vuetify/v0';
import type { OrderDiscount, OrderSurcharge } from '@/core/order/types';
import { money, type CurrencyCode } from '@/core/money';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    initialTab?: 'discount' | 'surcharge' | 'tax';
    currentDiscount?: OrderDiscount | null;
    currentSurcharge?: OrderSurcharge | null;
    currentTaxRate?: number | null;
    currentTaxMode?: 'inclusive' | 'exclusive';
    currency?: CurrencyCode;
    subtotalMinor?: number;
    maxDiscountPercent?: number;
  }>(),
  {
    open: false,
    modelValue: false,
    initialTab: 'discount',
    currentDiscount: null,
    currentSurcharge: null,
    currentTaxRate: null,
    currentTaxMode: 'inclusive',
    currency: 'VND',
    subtotalMinor: 0,
    maxDiscountPercent: 100,
  },
);

const emit = defineEmits<{
  'update:open': [val: boolean];
  'update:modelValue': [val: boolean];
  'apply-discount': [discount: OrderDiscount];
  'remove-discount': [];
  'apply-surcharge': [surcharge: OrderSurcharge];
  'remove-surcharge': [];
  'set-tax': [payload: { rate: number; taxMode: 'inclusive' | 'exclusive' }];
  'remove-tax': [];
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open || props.modelValue,
  set: (val: boolean) => {
    emit('update:open', val);
    emit('update:modelValue', val);
  },
});

const activeTab = ref<'discount' | 'surcharge' | 'tax'>(props.initialTab);

// --- Discount Form State ---
const discountType = ref<'percent' | 'fixed'>('percent');
const discountValue = ref<string>('10');
const discountReason = ref('');
const discountError = ref<string | null>(null);

// --- Surcharge Form State ---
const surchargeName = ref('Phí dịch vụ');
const surchargeType = ref<'percent' | 'fixed'>('percent');
const surchargeValue = ref<string>('5');
const surchargeError = ref<string | null>(null);

// --- Tax Form State ---
const taxRateValue = ref<string>('10');
const taxModeValue = ref<'inclusive' | 'exclusive'>('inclusive');
const taxError = ref<string | null>(null);

watch(
  () => [props.open, props.modelValue, props.initialTab] as const,
  ([open, modelVal, initTab]) => {
    if (open || modelVal) {
      activeTab.value = initTab || 'discount';
      discountError.value = null;
      surchargeError.value = null;
      taxError.value = null;

      if (props.currentDiscount) {
        discountType.value = props.currentDiscount.type;
        discountValue.value = String(props.currentDiscount.value);
        discountReason.value = props.currentDiscount.reason || '';
      } else {
        discountType.value = 'percent';
        discountValue.value = '10';
        discountReason.value = '';
      }

      if (props.currentSurcharge) {
        surchargeName.value = props.currentSurcharge.name;
        if (props.currentSurcharge.ratePercent !== undefined) {
          surchargeType.value = 'percent';
          surchargeValue.value = String(props.currentSurcharge.ratePercent);
        } else if (props.currentSurcharge.fixedAmount !== undefined) {
          surchargeType.value = 'fixed';
          surchargeValue.value = String(props.currentSurcharge.fixedAmount.minor);
        }
      } else {
        surchargeName.value = 'Phí dịch vụ';
        surchargeType.value = 'percent';
        surchargeValue.value = '5';
      }

      if (props.currentTaxRate !== null && props.currentTaxRate !== undefined) {
        taxRateValue.value = String(props.currentTaxRate);
      } else {
        taxRateValue.value = '10';
      }
      taxModeValue.value = props.currentTaxMode || 'inclusive';
    }
  },
  { immediate: true },
);

// Quick preset selections
const percentPresets = [5, 10, 15, 20, 50];
const fixedAmountPresets = [10000, 20000, 50000, 100000];
const surchargePresets = ['Phí dịch vụ', 'Phụ thu lễ tết', 'Phòng VIP'];
const taxRatePresets = [0, 5, 8, 10];

function handleApplyDiscount() {
  discountError.value = null;
  const val = Number(discountValue.value);

  if (isNaN(val) || val <= 0) {
    discountError.value =
      discountType.value === 'percent'
        ? t('pos.adjustments.invalidPercent')
        : t('pos.adjustments.invalidAmount');
    return;
  }

  if (discountType.value === 'percent') {
    const max = props.maxDiscountPercent || 100;
    if (val > max) {
      discountError.value = t('pos.adjustments.exceedMaxDiscount', { max });
      return;
    }
    const discountObj: OrderDiscount = {
      type: 'percent',
      value: val,
      ...(discountReason.value.trim() ? { reason: discountReason.value.trim() } : {}),
    };
    emit('apply-discount', discountObj);
  } else {
    if (props.subtotalMinor > 0 && val > props.subtotalMinor) {
      discountError.value = t('pos.adjustments.exceedSubtotal');
      return;
    }
    const discountObj: OrderDiscount = {
      type: 'fixed',
      value: Math.floor(val),
      ...(discountReason.value.trim() ? { reason: discountReason.value.trim() } : {}),
    };
    emit('apply-discount', discountObj);
  }

  isOpen.value = false;
}

function handleRemoveDiscount() {
  emit('remove-discount');
  isOpen.value = false;
}

function handleApplySurcharge() {
  surchargeError.value = null;
  const name = surchargeName.value.trim();
  const val = Number(surchargeValue.value);

  if (!name) {
    surchargeError.value = t('pos.adjustments.surchargeNamePlaceholder');
    return;
  }

  if (isNaN(val) || val <= 0) {
    surchargeError.value = t('pos.adjustments.invalidAmount');
    return;
  }

  if (surchargeType.value === 'percent') {
    emit('apply-surcharge', {
      type: 'service_charge',
      name,
      ratePercent: Math.min(100, val),
    });
  } else {
    emit('apply-surcharge', {
      type: 'custom',
      name,
      fixedAmount: money(Math.floor(val), props.currency || 'VND'),
    });
  }

  isOpen.value = false;
}

function handleRemoveSurcharge() {
  emit('remove-surcharge');
  isOpen.value = false;
}

function handleApplyTax() {
  taxError.value = null;
  const val = Number(taxRateValue.value);

  if (isNaN(val) || val < 0 || val > 100) {
    taxError.value = t('pos.adjustments.invalidTaxRate');
    return;
  }

  emit('set-tax', {
    rate: val,
    taxMode: taxModeValue.value,
  });

  isOpen.value = false;
}

function handleRemoveTax() {
  emit('remove-tax');
  isOpen.value = false;
}
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-md w-full p-6 space-y-4 m-auto"
      data-test="bill-adjustment-modal"
    >
      <!-- Header -->
      <div class="border-b border-border pb-3 flex items-center justify-between">
        <Dialog.Title class="text-base font-bold text-text">
          {{ t('pos.adjustments.title') }}
        </Dialog.Title>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-2 py-1 text-text-muted hover:text-text cursor-pointer"
          @click="isOpen = false"
        >
          <Button.Content><AppIcon><Close /></AppIcon></Button.Content>
        </Button.Root>
      </div>

      <!-- Tab Switcher (3 tabs: Discount, Surcharge, Tax) -->
      <div class="grid grid-cols-3 gap-1 p-1 bg-bg rounded-lg border border-border">
        <button
          type="button"
          class="py-1.5 text-xs font-bold rounded-md transition-colors text-center"
          :class="activeTab === 'discount' ? 'bg-surface text-primary shadow-xs' : 'text-text-muted hover:text-text'"
          data-test="tab-discount-btn"
          @click="activeTab = 'discount'"
        >
          <AppIcon><PricetagOutline /></AppIcon> {{ t('pos.adjustments.tabDiscount') }}
        </button>
        <button
          type="button"
          class="py-1.5 text-xs font-bold rounded-md transition-colors text-center"
          :class="activeTab === 'surcharge' ? 'bg-surface text-primary shadow-xs' : 'text-text-muted hover:text-text'"
          data-test="tab-surcharge-btn"
          @click="activeTab = 'surcharge'"
        >
          <AppIcon><NotificationsOutline /></AppIcon> {{ t('pos.adjustments.tabSurcharge') }}
        </button>
        <button
          type="button"
          class="py-1.5 text-xs font-bold rounded-md transition-colors text-center"
          :class="activeTab === 'tax' ? 'bg-surface text-primary shadow-xs' : 'text-text-muted hover:text-text'"
          data-test="tab-tax-btn"
          @click="activeTab = 'tax'"
        >
          <AppIcon><ReceiptOutline /></AppIcon> {{ t('pos.adjustments.tabTax') }}
        </button>
      </div>

      <!-- TAB 1: KHUYẾN MẠI / CHIẾT KHẤU -->
      <div v-if="activeTab === 'discount'" class="space-y-4 text-xs" data-test="discount-panel">
        <div
          v-if="discountError"
          class="p-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger"
          data-test="discount-error"
        >
          {{ discountError }}
        </div>

        <!-- Chọn loại: Phần trăm vs Số tiền -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.discountType') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="btn text-xs py-1.5 px-3 rounded-md border text-center font-medium transition-colors"
              :class="discountType === 'percent' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg text-text'"
              data-test="discount-type-percent"
              @click="discountType = 'percent'"
            >
              {{ t('pos.adjustments.percent') }}
            </button>
            <button
              type="button"
              class="btn text-xs py-1.5 px-3 rounded-md border text-center font-medium transition-colors"
              :class="discountType === 'fixed' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg text-text'"
              data-test="discount-type-fixed"
              @click="discountType = 'fixed'"
            >
              {{ t('pos.adjustments.fixedAmount') }}
            </button>
          </div>
        </div>

        <!-- Mức giảm -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.discountValue') }}</label>
          <div class="flex items-center gap-2">
            <Input.Root v-model="discountValue" class="flex-1" data-test="discount-value-input">
              <Input.Control
                type="number"
                min="0"
                class="field-input py-1.5 px-3 text-xs w-full text-right font-mono"
              />
            </Input.Root>
            <span class="font-bold text-text text-sm">
              {{ discountType === 'percent' ? '%' : '₫' }}
            </span>
          </div>
        </div>

        <!-- Nút chọn nhanh (Quick Presets) -->
        <div class="space-y-1">
          <div class="text-[11px] text-text-muted">{{ t('pos.adjustments.quickPresets') }}:</div>
          <div v-if="discountType === 'percent'" class="flex gap-1.5 flex-wrap">
            <button
              v-for="p in percentPresets"
              :key="p"
              type="button"
              class="px-2 py-1 rounded bg-surface border border-border hover:bg-bg text-xs font-mono font-medium transition-colors cursor-pointer"
              @click="discountValue = String(p)"
            >
              {{ p }}%
            </button>
          </div>
          <div v-else class="flex gap-1.5 flex-wrap">
            <button
              v-for="p in fixedAmountPresets"
              :key="p"
              type="button"
              class="px-2 py-1 rounded bg-surface border border-border hover:bg-bg text-xs font-mono font-medium transition-colors cursor-pointer"
              @click="discountValue = String(p)"
            >
              {{ (p / 1000).toLocaleString() }}k
            </button>
          </div>
        </div>

        <!-- Lý do / Chương trình -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.discountReason') }}</label>
          <Input.Root v-model="discountReason" data-test="discount-reason-input">
            <Input.Control
              class="field-input py-1.5 px-3 text-xs w-full"
              :placeholder="t('pos.adjustments.discountReasonPlaceholder')"
            />
          </Input.Root>
        </div>

        <!-- Nút hành động -->
        <div class="border-t border-border pt-3 flex items-center justify-between">
          <Button.Root
            v-if="currentDiscount"
            type="button"
            class="btn btn-ghost text-danger text-xs px-2.5 py-1.5 hover:bg-danger/10"
            data-test="remove-discount-btn"
            @click="handleRemoveDiscount"
          >
            <Button.Content>{{ t('pos.adjustments.remove') }}</Button.Content>
          </Button.Root>
          <div class="ml-auto flex items-center gap-2">
            <Button.Root
              type="button"
              class="btn btn-ghost text-xs px-3 py-1.5"
              @click="isOpen = false"
            >
              <Button.Content>{{ t('pos.adjustments.cancel') }}</Button.Content>
            </Button.Root>
            <Button.Root
              type="button"
              class="btn btn-primary text-xs px-4 py-1.5 font-bold shadow-xs"
              data-test="apply-discount-btn"
              @click="handleApplyDiscount"
            >
              <Button.Content>{{ t('pos.adjustments.apply') }}</Button.Content>
            </Button.Root>
          </div>
        </div>
      </div>

      <!-- TAB 2: PHỤ THU & PHÍ DỊCH VỤ -->
      <div v-else-if="activeTab === 'surcharge'" class="space-y-4 text-xs" data-test="surcharge-panel">
        <div
          v-if="surchargeError"
          class="p-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger"
          data-test="surcharge-error"
        >
          {{ surchargeError }}
        </div>

        <!-- Tên khoản phụ thu -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.surchargeName') }}</label>
          <Input.Root v-model="surchargeName" data-test="surcharge-name-input">
            <Input.Control
              class="field-input py-1.5 px-3 text-xs w-full"
              :placeholder="t('pos.adjustments.surchargeNamePlaceholder')"
            />
          </Input.Root>
          <div class="flex gap-1.5 pt-1 flex-wrap">
            <button
              v-for="s in surchargePresets"
              :key="s"
              type="button"
              class="px-2 py-0.5 rounded bg-surface border border-border text-[11px] text-text-muted hover:text-text hover:bg-bg transition-colors cursor-pointer"
              @click="surchargeName = s"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- Loại phụ thu -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.surchargeType') }}</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="btn text-xs py-1.5 px-3 rounded-md border text-center font-medium transition-colors"
              :class="surchargeType === 'percent' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg text-text'"
              data-test="surcharge-type-percent"
              @click="surchargeType = 'percent'"
            >
              {{ t('pos.adjustments.percent') }}
            </button>
            <button
              type="button"
              class="btn text-xs py-1.5 px-3 rounded-md border text-center font-medium transition-colors"
              :class="surchargeType === 'fixed' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg text-text'"
              data-test="surcharge-type-fixed"
              @click="surchargeType = 'fixed'"
            >
              {{ t('pos.adjustments.fixedAmount') }}
            </button>
          </div>
        </div>

        <!-- Mức phụ thu -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.surchargeValue') }}</label>
          <div class="flex items-center gap-2">
            <Input.Root v-model="surchargeValue" class="flex-1" data-test="surcharge-value-input">
              <Input.Control
                type="number"
                min="0"
                class="field-input py-1.5 px-3 text-xs w-full text-right font-mono"
              />
            </Input.Root>
            <span class="font-bold text-text text-sm">
              {{ surchargeType === 'percent' ? '%' : '₫' }}
            </span>
          </div>
        </div>

        <!-- Nút hành động -->
        <div class="border-t border-border pt-3 flex items-center justify-between">
          <Button.Root
            v-if="currentSurcharge"
            type="button"
            class="btn btn-ghost text-danger text-xs px-2.5 py-1.5 hover:bg-danger/10"
            data-test="remove-surcharge-btn"
            @click="handleRemoveSurcharge"
          >
            <Button.Content>{{ t('pos.adjustments.remove') }}</Button.Content>
          </Button.Root>
          <div class="ml-auto flex items-center gap-2">
            <Button.Root
              type="button"
              class="btn btn-ghost text-xs px-3 py-1.5"
              @click="isOpen = false"
            >
              <Button.Content>{{ t('pos.adjustments.cancel') }}</Button.Content>
            </Button.Root>
            <Button.Root
              type="button"
              class="btn btn-primary text-xs px-4 py-1.5 font-bold shadow-xs"
              data-test="apply-surcharge-btn"
              @click="handleApplySurcharge"
            >
              <Button.Content>{{ t('pos.adjustments.apply') }}</Button.Content>
            </Button.Root>
          </div>
        </div>
      </div>

      <!-- TAB 3: THUẾ VAT (CÀI ĐẶT % VAT CHO ĐƠN) -->
      <div v-else class="space-y-4 text-xs" data-test="tax-panel">
        <div
          v-if="taxError"
          class="p-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger"
          data-test="tax-error"
        >
          {{ taxError }}
        </div>

        <!-- Nhập mức % VAT & Chọn nhanh -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.taxRateLabel') }}</label>
          <div class="flex items-center gap-2">
            <Input.Root v-model="taxRateValue" class="flex-1" data-test="tax-rate-input">
              <Input.Control
                type="number"
                min="0"
                max="100"
                class="field-input py-1.5 px-3 text-xs w-full text-right font-mono"
              />
            </Input.Root>
            <span class="font-bold text-text text-sm">%</span>
          </div>
          <!-- Phím chọn nhanh % VAT -->
          <div class="flex gap-1.5 pt-1 flex-wrap">
            <button
              v-for="r in taxRatePresets"
              :key="r"
              type="button"
              class="px-2.5 py-1 rounded bg-surface border border-border text-xs font-mono font-medium transition-colors cursor-pointer"
              :class="Number(taxRateValue) === r ? 'bg-primary text-primary-contrast border-primary font-bold' : 'hover:bg-bg text-text'"
              :data-test="`tax-preset-${r}`"
              @click="taxRateValue = String(r)"
            >
              {{ r }}%
            </button>
          </div>
        </div>

        <!-- Cơ chế tính thuế -->
        <div class="space-y-1">
          <label class="text-text-muted font-medium">{{ t('pos.adjustments.taxModeLabel') }}</label>
          <div class="space-y-1.5">
            <label
              class="flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors"
              :class="taxModeValue === 'inclusive' ? 'bg-primary/5 border-primary/40' : 'bg-surface border-border hover:bg-bg'"
            >
              <input
                type="radio"
                name="adjTaxMode"
                value="inclusive"
                v-model="taxModeValue"
                data-test="adj-tax-mode-inclusive"
                class="mt-0.5 text-primary focus:ring-primary"
              />
              <div>
                <div class="font-semibold text-text">{{ t('pos.billingSettings.taxModeInclusive') }}</div>
                <div class="text-[10px] text-text-muted">{{ t('pos.billingSettings.taxModeInclusiveHint') }}</div>
              </div>
            </label>

            <label
              class="flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors"
              :class="taxModeValue === 'exclusive' ? 'bg-primary/5 border-primary/40' : 'bg-surface border-border hover:bg-bg'"
            >
              <input
                type="radio"
                name="adjTaxMode"
                value="exclusive"
                v-model="taxModeValue"
                data-test="adj-tax-mode-exclusive"
                class="mt-0.5 text-primary focus:ring-primary"
              />
              <div>
                <div class="font-semibold text-text">{{ t('pos.billingSettings.taxModeExclusive') }}</div>
                <div class="text-[10px] text-text-muted">{{ t('pos.billingSettings.taxModeExclusiveHint') }}</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Nút hành động -->
        <div class="border-t border-border pt-3 flex items-center justify-between">
          <Button.Root
            v-if="currentTaxRate !== null && currentTaxRate !== undefined"
            type="button"
            class="btn btn-ghost text-danger text-xs px-2.5 py-1.5 hover:bg-danger/10"
            data-test="remove-tax-btn"
            @click="handleRemoveTax"
          >
            <Button.Content>{{ t('pos.adjustments.removeTax') }}</Button.Content>
          </Button.Root>
          <div class="ml-auto flex items-center gap-2">
            <Button.Root
              type="button"
              class="btn btn-ghost text-xs px-3 py-1.5"
              @click="isOpen = false"
            >
              <Button.Content>{{ t('pos.adjustments.cancel') }}</Button.Content>
            </Button.Root>
            <Button.Root
              type="button"
              class="btn btn-primary text-xs px-4 py-1.5 font-bold shadow-xs"
              data-test="apply-tax-btn"
              @click="handleApplyTax"
            >
              <Button.Content>{{ t('pos.adjustments.applyTax') }}</Button.Content>
            </Button.Root>
          </div>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
