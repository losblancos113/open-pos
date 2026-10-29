<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input, Checkbox } from '@vuetify/v0';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import type { UserDoc } from '@/core/auth/types';
import { canConfigureBilling } from '@/core/auth/permissions';
import type { OrderRepository } from '@/core/order/order-repository';
import type { BillingSettingsDoc } from '@/core/order/billing-settings';
import {
  billingSettingsDocId,
  createDefaultBillingSettings,
} from '@/core/order/billing-settings';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    currentSettings?: BillingSettingsDoc | null;
    orderRepository?: OrderRepository | null;
    branchId?: string;
    currentUser?: UserDoc | null;
  }>(),
  {
    open: false,
    modelValue: false,
    currentSettings: null,
    orderRepository: null,
    branchId: DEFAULT_BRANCH_ID,
    currentUser: null,
  },
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'update:modelValue', val: boolean): void;
  (e: 'save', settings: BillingSettingsDoc): void;
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open || props.modelValue,
  set: (val: boolean) => {
    emit('update:open', val);
    emit('update:modelValue', val);
  },
});

const canEdit = computed(() => {
  return canConfigureBilling(props.currentUser?.role);
});

// --- State Fields ---
// Khuyến mại / Chiết khấu
const discountEnabled = ref(true);
const maxDiscountPercent = ref<string>('100');

// Phụ thu
const surchargeEnabled = ref(true);
const defaultSurchargeName = ref('Phí dịch vụ');
const defaultSurchargeType = ref<'percent' | 'fixed'>('percent');
const defaultSurchargeRate = ref<string>('5');
const defaultSurchargeAmount = ref<string>('0');
const autoApplySurcharge = ref(false);

// Thuế VAT
const taxEnabled = ref(true);
const defaultTaxRate = ref<string>('10');
const taxMode = ref<'inclusive' | 'exclusive'>('inclusive');
const autoApplyTax = ref(false);
const allowManualTaxToggle = ref(true);

const isSaving = ref(false);
const saveError = ref<string | null>(null);
const saveSuccess = ref(false);

function syncFromDoc(doc: BillingSettingsDoc) {
  discountEnabled.value = doc.discountEnabled ?? true;
  maxDiscountPercent.value = String(doc.maxDiscountPercent ?? 100);

  surchargeEnabled.value = doc.surchargeEnabled ?? true;
  defaultSurchargeName.value = doc.defaultSurchargeName || 'Phí dịch vụ';
  defaultSurchargeType.value = doc.defaultSurchargeType || 'percent';
  defaultSurchargeRate.value = String(doc.defaultSurchargeRate ?? 5);
  defaultSurchargeAmount.value = String(doc.defaultSurchargeAmountMinor ?? 0);
  autoApplySurcharge.value = doc.autoApplySurcharge ?? false;

  taxEnabled.value = doc.taxEnabled ?? true;
  defaultTaxRate.value = String(doc.defaultTaxRate ?? 10);
  taxMode.value = doc.taxMode || 'inclusive';
  autoApplyTax.value = doc.autoApplyTax ?? false;
  allowManualTaxToggle.value = doc.allowManualTaxToggle ?? true;
}

function initFromSettings() {
  const base = props.currentSettings || createDefaultBillingSettings(props.branchId || DEFAULT_BRANCH_ID);
  syncFromDoc(base);
}

// Watch incoming settings or reset when modal opens
watch(
  () => [isOpen.value, props.currentSettings] as const,
  ([open]) => {
    if (open) {
      saveError.value = null;
      saveSuccess.value = false;
      initFromSettings();
    }
  },
  { immediate: true },
);

async function handleSave() {
  if (!canEdit.value || isSaving.value) return;
  isSaving.value = true;
  saveError.value = null;
  saveSuccess.value = false;

  try {
    const branch = props.branchId || DEFAULT_BRANCH_ID;
    const base = props.currentSettings || createDefaultBillingSettings(branch);

    const doc: BillingSettingsDoc = {
      ...base,
      _id: billingSettingsDocId(branch),
      branchId: branch,
      discountEnabled: Boolean(discountEnabled.value),
      maxDiscountPercent: Math.max(1, Math.min(100, Number(maxDiscountPercent.value) || 100)),

      surchargeEnabled: Boolean(surchargeEnabled.value),
      defaultSurchargeName: defaultSurchargeName.value.trim() || 'Phí dịch vụ',
      defaultSurchargeType: defaultSurchargeType.value,
      defaultSurchargeRate: Math.max(0, Math.min(100, Number(defaultSurchargeRate.value) || 0)),
      defaultSurchargeAmountMinor: Math.max(0, Math.floor(Number(defaultSurchargeAmount.value) || 0)),
      autoApplySurcharge: Boolean(autoApplySurcharge.value),

      taxEnabled: Boolean(taxEnabled.value),
      defaultTaxRate: Math.max(0, Math.min(100, Number(defaultTaxRate.value) || 0)),
      taxMode: taxMode.value,
      autoApplyTax: Boolean(autoApplyTax.value),
      allowManualTaxToggle: Boolean(allowManualTaxToggle.value),

      updatedAt: new Date().toISOString(),
      updatedBy: props.currentUser?.username || 'admin',
    };

    if (props.orderRepository) {
      await props.orderRepository.saveBillingSettings(doc);
    }

    emit('save', doc);
    saveSuccess.value = true;
    setTimeout(() => {
      isOpen.value = false;
    }, 600);
  } catch (err: unknown) {
    saveError.value = err instanceof Error ? err.message : String(err ?? 'Save failed');
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-lg w-full p-6 space-y-5 m-auto max-h-[90vh] overflow-y-auto"
      data-test="billing-settings-modal"
    >
      <!-- Tiêu đề modal -->
      <div class="border-b border-border pb-3 flex items-start justify-between">
        <div>
          <Dialog.Title class="text-lg font-bold text-text flex items-center gap-2">
            <span>⚙️</span>
            <span>{{ t('pos.billingSettings.title') }}</span>
          </Dialog.Title>
          <Dialog.Description class="text-xs text-text-muted mt-1">
            {{ t('pos.billingSettings.description') }}
          </Dialog.Description>
        </div>
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-2 py-1 text-text-muted hover:text-text cursor-pointer"
          @click="isOpen = false"
        >
          <Button.Content>✕</Button.Content>
        </Button.Root>
      </div>

      <!-- Cảnh báo nếu không có quyền quản lý -->
      <div
        v-if="!canEdit"
        class="p-3 rounded-md bg-warning/10 border border-warning/30 text-warning text-xs flex items-center gap-2"
        data-test="billing-settings-forbidden-banner"
      >
        <span>⚠️</span>
        <span>{{ t('pos.billingSettings.permissionDenied') }}</span>
      </div>

      <!-- Thông báo lỗi hoặc thành công -->
      <div
        v-if="saveError"
        class="p-2.5 rounded-md bg-danger/10 border border-danger/30 text-danger text-xs error-text"
        data-test="billing-settings-error"
      >
        {{ saveError }}
      </div>
      <div
        v-if="saveSuccess"
        class="p-2.5 rounded-md bg-success/10 border border-success/30 text-success text-xs font-medium"
        data-test="billing-settings-success"
      >
        ✓ {{ t('pos.billingSettings.saveSuccess') }}
      </div>

      <!-- Danh mục cài đặt -->
      <div class="space-y-6 text-xs">
        <!-- 1. KHUYẾN MẠI & CHIẾT KHẤU -->
        <div class="p-4 rounded-lg bg-surface/50 border border-border space-y-3" data-test="discount-settings-section">
          <div class="flex items-center justify-between">
            <div class="font-bold text-sm text-text flex items-center gap-1.5">
              <span>🏷️</span>
              <span>{{ t('pos.billingSettings.discountSection') }}</span>
            </div>
            <label class="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                v-model="discountEnabled"
                :disabled="!canEdit"
                data-test="discount-enable-toggle"
                class="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span :class="discountEnabled ? 'text-primary font-bold' : 'text-text-muted'">
                {{ discountEnabled ? t('pos.billingSettings.enabled') : t('pos.billingSettings.disabled') }}
              </span>
            </label>
          </div>

          <div v-if="discountEnabled" class="pt-2 border-t border-border/50 space-y-2">
            <label class="block text-text-muted">
              {{ t('pos.billingSettings.maxDiscount') }}
            </label>
            <div class="flex items-center gap-2">
              <Input.Root
                v-model="maxDiscountPercent"
                class="w-32"
                :disabled="!canEdit"
                data-test="max-discount-input"
              >
                <Input.Control
                  type="number"
                  min="1"
                  max="100"
                  class="field-input py-1.5 px-3 text-xs w-full text-right"
                />
              </Input.Root>
              <span class="text-text-muted font-bold">%</span>
            </div>
          </div>
        </div>

        <!-- 2. PHỤ THU & PHÍ DỊCH VỤ -->
        <div class="p-4 rounded-lg bg-surface/50 border border-border space-y-3" data-test="surcharge-settings-section">
          <div class="flex items-center justify-between">
            <div class="font-bold text-sm text-text flex items-center gap-1.5">
              <span>🛎️</span>
              <span>{{ t('pos.billingSettings.surchargeSection') }}</span>
            </div>
            <label class="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                v-model="surchargeEnabled"
                :disabled="!canEdit"
                data-test="surcharge-enable-toggle"
                class="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span :class="surchargeEnabled ? 'text-primary font-bold' : 'text-text-muted'">
                {{ surchargeEnabled ? t('pos.billingSettings.enabled') : t('pos.billingSettings.disabled') }}
              </span>
            </label>
          </div>

          <div v-if="surchargeEnabled" class="pt-2 border-t border-border/50 space-y-3">
            <div>
              <label class="block text-text-muted mb-1">
                {{ t('pos.billingSettings.surchargeName') }}
              </label>
              <Input.Root
                v-model="defaultSurchargeName"
                :disabled="!canEdit"
                data-test="surcharge-name-input"
              >
                <Input.Control
                  class="field-input py-1.5 px-3 text-xs w-full"
                  placeholder="Ví dụ: Phí dịch vụ"
                />
              </Input.Root>
            </div>

            <!-- Loại phụ thu: Phần trăm hay Cố định -->
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                :disabled="!canEdit"
                class="btn text-xs py-1.5 px-2 rounded-md border text-center transition-colors"
                :class="defaultSurchargeType === 'percent' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg'"
                @click="defaultSurchargeType = 'percent'"
              >
                {{ t('pos.billingSettings.surchargePercent') }}
              </button>
              <button
                type="button"
                :disabled="!canEdit"
                class="btn text-xs py-1.5 px-2 rounded-md border text-center transition-colors"
                :class="defaultSurchargeType === 'fixed' ? 'bg-primary text-primary-contrast border-primary font-bold' : 'bg-surface border-border hover:bg-bg'"
                @click="defaultSurchargeType = 'fixed'"
              >
                {{ t('pos.billingSettings.surchargeFixed') }}
              </button>
            </div>

            <!-- Mức phụ thu -->
            <div v-if="defaultSurchargeType === 'percent'" class="flex items-center gap-2">
              <Input.Root
                v-model="defaultSurchargeRate"
                class="w-32"
                :disabled="!canEdit"
                data-test="surcharge-rate-input"
              >
                <Input.Control
                  type="number"
                  min="0"
                  max="100"
                  class="field-input py-1.5 px-3 text-xs w-full text-right"
                />
              </Input.Root>
              <span class="text-text-muted font-bold">%</span>
            </div>
            <div v-else class="flex items-center gap-2">
              <Input.Root
                v-model="defaultSurchargeAmount"
                class="w-40"
                :disabled="!canEdit"
                data-test="surcharge-amount-input"
              >
                <Input.Control
                  type="number"
                  min="0"
                  step="1000"
                  class="field-input py-1.5 px-3 text-xs w-full text-right"
                />
              </Input.Root>
              <span class="text-text-muted font-bold">₫</span>
            </div>

            <!-- Checkbox tự động áp dụng -->
            <label class="flex items-center gap-2 cursor-pointer text-text">
              <input
                type="checkbox"
                v-model="autoApplySurcharge"
                :disabled="!canEdit"
                data-test="surcharge-auto-apply-checkbox"
                class="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span>{{ t('pos.billingSettings.autoApplySurcharge') }}</span>
            </label>
          </div>
        </div>

        <!-- 3. THUẾ GTGT (VAT) -->
        <div class="p-4 rounded-lg bg-surface/50 border border-border space-y-3" data-test="tax-settings-section">
          <div class="flex items-center justify-between">
            <div class="font-bold text-sm text-text flex items-center gap-1.5">
              <span>🧾</span>
              <span>{{ t('pos.billingSettings.taxSection') }}</span>
            </div>
            <label class="flex items-center gap-2 cursor-pointer font-medium">
              <input
                type="checkbox"
                v-model="taxEnabled"
                :disabled="!canEdit"
                data-test="tax-enable-toggle"
                class="rounded border-border text-primary focus:ring-primary h-4 w-4"
              />
              <span :class="taxEnabled ? 'text-primary font-bold' : 'text-text-muted'">
                {{ taxEnabled ? t('pos.billingSettings.enabled') : t('pos.billingSettings.disabled') }}
              </span>
            </label>
          </div>

          <div v-if="taxEnabled" class="pt-2 border-t border-border/50 space-y-3">
            <!-- Thuế suất mặc định & Nút chọn nhanh -->
            <div>
              <label class="block text-text-muted mb-1.5">
                {{ t('pos.billingSettings.taxRate') }}
              </label>
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  v-for="r in [0, 5, 8, 10]"
                  :key="r"
                  type="button"
                  :disabled="!canEdit"
                  class="px-2.5 py-1 rounded text-xs border font-medium cursor-pointer transition-colors"
                  :class="Number(defaultTaxRate) === r ? 'bg-primary text-primary-contrast border-primary' : 'bg-surface border-border hover:bg-bg'"
                  @click="defaultTaxRate = String(r)"
                >
                  {{ r }}%
                </button>
                <div class="flex items-center gap-1 ml-auto">
                  <Input.Root
                    v-model="defaultTaxRate"
                    class="w-20"
                    :disabled="!canEdit"
                    data-test="tax-rate-input"
                  >
                    <Input.Control
                      type="number"
                      min="0"
                      max="100"
                      class="field-input py-1 px-2 text-xs w-full text-right"
                    />
                  </Input.Root>
                  <span class="text-text-muted font-bold">%</span>
                </div>
              </div>
            </div>

            <!-- Cơ chế tính thuế: Đã gồm thuế (Inclusive) hay Cộng thêm (Exclusive) -->
            <div>
              <label class="block text-text-muted mb-1.5 font-medium">
                {{ t('pos.billingSettings.taxMode') }}
              </label>
              <div class="space-y-2">
                <label
                  class="flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors"
                  :class="taxMode === 'inclusive' ? 'bg-primary/5 border-primary/40' : 'bg-surface border-border hover:bg-bg'"
                >
                  <input
                    type="radio"
                    name="taxMode"
                    value="inclusive"
                    v-model="taxMode"
                    :disabled="!canEdit"
                    data-test="tax-mode-inclusive"
                    class="mt-0.5 text-primary focus:ring-primary"
                  />
                  <div>
                    <div class="font-semibold text-text">{{ t('pos.billingSettings.taxModeInclusive') }}</div>
                    <div class="text-[11px] text-text-muted">{{ t('pos.billingSettings.taxModeInclusiveHint') }}</div>
                  </div>
                </label>

                <label
                  class="flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors"
                  :class="taxMode === 'exclusive' ? 'bg-primary/5 border-primary/40' : 'bg-surface border-border hover:bg-bg'"
                >
                  <input
                    type="radio"
                    name="taxMode"
                    value="exclusive"
                    v-model="taxMode"
                    :disabled="!canEdit"
                    data-test="tax-mode-exclusive"
                    class="mt-0.5 text-primary focus:ring-primary"
                  />
                  <div>
                    <div class="font-semibold text-text">{{ t('pos.billingSettings.taxModeExclusive') }}</div>
                    <div class="text-[11px] text-text-muted">{{ t('pos.billingSettings.taxModeExclusiveHint') }}</div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Checkbox tùy chọn tự động & bật tắt thu ngân -->
            <div class="space-y-2 pt-1">
              <label class="flex items-center gap-2 cursor-pointer text-text">
                <input
                  type="checkbox"
                  v-model="autoApplyTax"
                  :disabled="!canEdit"
                  data-test="tax-auto-apply-checkbox"
                  class="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>{{ t('pos.billingSettings.autoApplyTax') }}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer text-text">
                <input
                  type="checkbox"
                  v-model="allowManualTaxToggle"
                  :disabled="!canEdit"
                  data-test="tax-manual-toggle-checkbox"
                  class="rounded border-border text-primary focus:ring-primary h-4 w-4"
                />
                <span>{{ t('pos.billingSettings.allowManualTaxToggle') }}</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="border-t border-border pt-4 flex items-center justify-end gap-2">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-4 py-2"
          @click="isOpen = false"
        >
          <Button.Content>{{ t('pos.billingSettings.close') }}</Button.Content>
        </Button.Root>
        <Button.Root
          v-if="canEdit"
          type="button"
          :disabled="isSaving"
          class="btn btn-primary text-xs px-4 py-2 font-bold flex items-center gap-1.5 shadow-sm"
          data-test="save-billing-settings-btn"
          @click="handleSave"
        >
          <Button.Content>
            <span v-if="isSaving">⏳</span>
            <span>{{ t('pos.billingSettings.saveBtn') }}</span>
          </Button.Content>
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
