<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog, Input, Select } from '@vuetify/v0';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { bankAccountDocId } from '@/core/db/ids';
import type { BankAccountDoc } from '@/core/qr/bank-account';
import { BANK_PRESETS } from '@/core/qr/bank-account';
import { sanitizeAccountName } from '@/core/qr/vietqr';
import type { OrderRepository } from '@/core/order/order-repository';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    currentAccount?: BankAccountDoc | null;
    orderRepository?: OrderRepository | null;
    branchId?: string;
  }>(),
  {
    open: false,
    modelValue: false,
    currentAccount: null,
    orderRepository: null,
    branchId: DEFAULT_BRANCH_ID,
  },
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'update:modelValue', val: boolean): void;
  (e: 'save', bankAccount: BankAccountDoc): void;
}>();

const { t } = useI18n();

const isOpen = computed({
  get: () => props.open || props.modelValue,
  set: (val: boolean) => {
    emit('update:open', val);
    emit('update:modelValue', val);
  },
});

const bankOptions = computed(() => [
  ...BANK_PRESETS.map((preset) => ({
    key: preset.bin,
    label: `${preset.name} (${preset.bin})`,
    preset,
  })),
  {
    key: 'custom',
    label: t('pos.bank.customBank'),
    preset: null,
  },
]);

const selectedBankKey = ref<string>('');
const customBin = ref<string>('');
const customBankName = ref<string>('');
const accountNumber = ref<string>('');
const accountName = ref<string>('');
const isSaving = ref(false);
const saveError = ref<string | null>(null);

const isCustomBank = computed(() => selectedBankKey.value === 'custom');

const effectiveBin = computed(() => {
  if (isCustomBank.value) return customBin.value.trim();
  const preset = BANK_PRESETS.find((p) => p.bin === selectedBankKey.value);
  return preset ? preset.bin : customBin.value.trim();
});

const effectiveBankName = computed(() => {
  if (isCustomBank.value) return customBankName.value.trim();
  const preset = BANK_PRESETS.find((p) => p.bin === selectedBankKey.value);
  return preset ? preset.name : customBankName.value.trim();
});

const selectedBankLabel = computed(() => {
  if (!selectedBankKey.value) return t('pos.bank.selectBank');
  if (selectedBankKey.value === 'custom') return t('pos.bank.customBank');
  const preset = BANK_PRESETS.find((p) => p.bin === selectedBankKey.value);
  return preset ? `${preset.name} (${preset.bin})` : selectedBankKey.value;
});

function onSelectBank(key: unknown) {
  saveError.value = null;
  const strKey = String(key ?? '');
  selectedBankKey.value = strKey;
  if (strKey === 'custom') {
    if (BANK_PRESETS.some((p) => p.bin === customBin.value)) {
      customBin.value = '';
      customBankName.value = '';
    }
  } else {
    const preset = BANK_PRESETS.find((p) => p.bin === strKey);
    if (preset) {
      customBin.value = preset.bin;
      customBankName.value = preset.name;
    }
  }
}

function normalizeAccountNameInput(val: string): string {
  if (typeof val !== 'string') return '';
  return val
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .toUpperCase()
    .slice(0, 25);
}

function onAccountNumberInput(eventOrVal: Event | unknown) {
  saveError.value = null;
  const raw = typeof eventOrVal === 'string'
    ? eventOrVal
    : (eventOrVal as Event)?.target
      ? ((eventOrVal as Event).target as HTMLInputElement).value
      : String(eventOrVal ?? '');
  const filtered = raw.replace(/\D/g, '').slice(0, 30);
  accountNumber.value = filtered;
  if (typeof eventOrVal !== 'string' && (eventOrVal as Event)?.target) {
    ((eventOrVal as Event).target as HTMLInputElement).value = filtered;
  }
}

function onCustomBinInput(eventOrVal: Event | unknown) {
  saveError.value = null;
  const raw = typeof eventOrVal === 'string'
    ? eventOrVal
    : (eventOrVal as Event)?.target
      ? ((eventOrVal as Event).target as HTMLInputElement).value
      : String(eventOrVal ?? '');
  const filtered = raw.replace(/\D/g, '').slice(0, 6);
  customBin.value = filtered;
  if (typeof eventOrVal !== 'string' && (eventOrVal as Event)?.target) {
    ((eventOrVal as Event).target as HTMLInputElement).value = filtered;
  }
}

function onAccountNameInput(eventOrVal: Event | unknown) {
  saveError.value = null;
  const raw = typeof eventOrVal === 'string'
    ? eventOrVal
    : (eventOrVal as Event)?.target
      ? ((eventOrVal as Event).target as HTMLInputElement).value
      : String(eventOrVal ?? '');
  const normalized = normalizeAccountNameInput(raw);
  accountName.value = normalized;
  if (typeof eventOrVal !== 'string' && (eventOrVal as Event)?.target) {
    ((eventOrVal as Event).target as HTMLInputElement).value = normalized;
  }
}

function initFromAccount() {
  saveError.value = null;
  if (props.currentAccount) {
    const preset = BANK_PRESETS.find((p) => p.bin === props.currentAccount?.bankBin);
    if (preset) {
      selectedBankKey.value = preset.bin;
      customBin.value = preset.bin;
      customBankName.value = preset.name;
    } else {
      selectedBankKey.value = 'custom';
      customBin.value = props.currentAccount.bankBin || '';
      customBankName.value = props.currentAccount.bankName || '';
    }
    accountNumber.value = props.currentAccount.accountNumber || '';
    accountName.value = props.currentAccount.accountName || '';
  } else {
    const defaultPreset = BANK_PRESETS[0];
    selectedBankKey.value = defaultPreset ? defaultPreset.bin : '';
    customBin.value = defaultPreset ? defaultPreset.bin : '';
    customBankName.value = defaultPreset ? defaultPreset.name : '';
    accountNumber.value = '';
    accountName.value = '';
  }
}

watch(
  () => [isOpen.value, props.currentAccount],
  ([open]) => {
    if (open) {
      initFromAccount();
    }
  },
  { immediate: true },
);

const canSave = computed(() => {
  const bin = effectiveBin.value;
  const name = effectiveBankName.value;
  const num = accountNumber.value.trim();
  const accName = sanitizeAccountName(accountName.value);
  if (isCustomBank.value && customBin.value.length !== 6) {
    return false;
  }
  return Boolean(bin && name && num && accName);
});

async function handleSave() {
  if (!canSave.value || isSaving.value) return;
  isSaving.value = true;
  saveError.value = null;
  try {
    const doc: BankAccountDoc = {
      _id: bankAccountDocId(props.branchId),
      branchId: props.branchId,
      bankBin: effectiveBin.value,
      bankName: effectiveBankName.value,
      accountNumber: accountNumber.value.trim(),
      accountName: sanitizeAccountName(accountName.value),
      updatedAt: new Date().toISOString(),
    };

    if (props.orderRepository) {
      try {
        await props.orderRepository.saveBankAccount(doc);
      } catch (err: unknown) {
        saveError.value = err instanceof Error ? err.message : String(err ?? 'Save failed');
        return;
      }
    }

    emit('save', doc);
    isOpen.value = false;
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
      class="panel-card max-w-md w-full p-6 space-y-5 m-auto"
      data-test="bank-settings-modal"
    >
      <!-- Tiêu đề modal -->
      <div class="border-b border-border pb-3">
        <Dialog.Title class="text-lg font-bold text-text">
          {{ t('pos.bank.title') }}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-text-muted mt-1">
          {{ t('pos.bank.selectBank') }}
        </Dialog.Description>
      </div>

      <!-- Biểu mẫu nhập liệu -->
      <div class="space-y-4">
        <!-- Thông báo lỗi nếu lưu thất bại -->
        <div
          v-if="saveError"
          class="error-text p-2.5 bg-danger/10 border border-danger/30 rounded-md text-xs"
          role="alert"
          data-test="bank-settings-error"
        >
          {{ saveError }}
        </div>

        <!-- Ngân hàng thụ hưởng -->
        <div class="space-y-1.5">
          <label class="field-label text-xs font-semibold uppercase text-text-muted">
            {{ t('pos.bank.selectBank') }}
          </label>
          <div data-test="bank-select" class="w-full">
            <Select.Root
              :model-value="selectedBankKey"
              @update:model-value="onSelectBank"
            >
              <Select.Activator class="field-input py-2 px-3 text-sm cursor-pointer w-full flex items-center justify-between">
                <span>{{ selectedBankLabel }}</span>
                <span class="text-xs text-text-muted">▼</span>
              </Select.Activator>
              <Select.Content eager class="panel-card p-1 shadow-lg max-h-60 overflow-y-auto">
                <Select.Item
                  v-for="bank in bankOptions"
                  :key="bank.key"
                  :value="bank.key"
                  :data-value="bank.key"
                  class="p-2 text-sm rounded cursor-pointer hover:bg-bg selected:(bg-primary/10 text-primary font-medium)"
                  @click="onSelectBank(bank.key)"
                >
                  {{ bank.label }}
                </Select.Item>
              </Select.Content>
            </Select.Root>
          </div>
        </div>

        <!-- Nhập BIN & Tên ngân hàng tuỳ chỉnh khi chọn Ngân hàng khác -->
        <div v-if="isCustomBank" class="space-y-4 pt-1">
          <div class="space-y-1.5">
            <label class="field-label text-xs font-semibold uppercase text-text-muted">
              {{ t('pos.bank.bin') }} *
            </label>
            <Input.Root
              :model-value="customBin"
              data-test="custom-bin"
              type="text"
              maxlength="6"
              class="w-full"
              @update:model-value="onCustomBinInput"
            >
              <Input.Control
                class="field-input w-full"
                maxlength="6"
                :placeholder="t('pos.bank.bin')"
                @input="onCustomBinInput"
              />
            </Input.Root>
          </div>

          <div class="space-y-1.5">
            <label class="field-label text-xs font-semibold uppercase text-text-muted">
              {{ t('pos.bank.bankName') }} *
            </label>
            <Input.Root
              v-model="customBankName"
              data-test="custom-bank-name"
              type="text"
              class="w-full"
            >
              <Input.Control
                class="field-input w-full"
                :placeholder="t('pos.bank.bankName')"
              />
            </Input.Root>
          </div>
        </div>

        <!-- Số tài khoản -->
        <div class="space-y-1.5">
          <label class="field-label text-xs font-semibold uppercase text-text-muted">
            {{ t('pos.bank.accountNumber') }} *
          </label>
          <Input.Root
            :model-value="accountNumber"
            data-test="account-number"
            type="text"
            maxlength="30"
            class="w-full"
            @update:model-value="onAccountNumberInput"
          >
            <Input.Control
              class="field-input w-full"
              maxlength="30"
              :placeholder="t('pos.bank.accountNumber')"
              @input="onAccountNumberInput"
            />
          </Input.Root>
        </div>

        <!-- Tên chủ tài khoản -->
        <div class="space-y-1.5">
          <label class="field-label text-xs font-semibold uppercase text-text-muted">
            {{ t('pos.bank.accountName') }} *
          </label>
          <Input.Root
            :model-value="accountName"
            data-test="account-name"
            type="text"
            maxlength="25"
            class="w-full"
            @update:model-value="onAccountNameInput"
          >
            <Input.Control
              class="field-input w-full uppercase"
              maxlength="25"
              :placeholder="t('pos.bank.accountName')"
              @input="onAccountNameInput"
            />
          </Input.Root>
        </div>
      </div>

      <!-- Nút hành động: Huỷ và Lưu -->
      <div class="border-t border-border pt-4 flex items-center justify-end gap-3">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-3 py-2 cursor-pointer"
          data-test="cancel-bank-btn"
          @click="isOpen = false"
        >
          {{ t('common.cancel') }}
        </Button.Root>

        <Button.Root
          type="button"
          class="btn btn-primary text-xs px-4 py-2 cursor-pointer disabled:(opacity-50 cursor-not-allowed)"
          data-test="save-bank-btn"
          :disabled="!canSave || isSaving"
          @click="handleSave"
        >
          {{ isSaving ? t('common.loading') : t('common.save') }}
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
