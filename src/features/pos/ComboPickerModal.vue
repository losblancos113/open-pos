<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Dialog } from '@vuetify/v0';
import type { ComboDoc, ComboGroup } from '@/core/catalog/combo';
import type { ProductDoc } from '@/core/catalog/product';
import type { ComboSelection, OrderLineItem } from '@/core/order/types';
import type { Money } from '@/core/money';
import { money, add, format } from '@/core/money';
import type { LocalizedText } from '@/core/types/definition';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    combo: ComboDoc | null;
    productNames?: ReadonlyMap<string, LocalizedText> | Record<string, LocalizedText>;
    products?: readonly ProductDoc[];
  }>(),
  {
    open: false,
    modelValue: false,
    productNames: () => new Map(),
    products: () => [],
  },
);

const emit = defineEmits<{
  (e: 'update:open', val: boolean): void;
  (e: 'update:modelValue', val: boolean): void;
  (e: 'confirm', item: OrderLineItem): void;
}>();

const { t, locale } = useI18n();

const isOpen = computed({
  get: () => props.open || props.modelValue,
  set: (val: boolean) => {
    emit('update:open', val);
    emit('update:modelValue', val);
  },
});

const selectedOptions = ref<Record<string, string[]>>({});

function initSelections() {
  if (!props.combo) return;

  const initial: Record<string, string[]> = {};
  for (const group of props.combo.comboGroups) {
    if (group.minSelect > 0 && group.options.length > 0) {
      // Mặc định chọn các món đầu tiên thoả minSelect
      const defaultOptions = group.options.slice(0, group.minSelect).map((o) => o.optionId);
      initial[group.key] = defaultOptions;
    } else {
      initial[group.key] = [];
    }
  }
  selectedOptions.value = initial;
}

watch(
  () => [isOpen.value, props.combo],
  ([open]) => {
    if (open) {
      initSelections();
    }
  },
  { immediate: true },
);

function resolveProductName(productId: string): string {
  if (props.productNames instanceof Map) {
    const loc = props.productNames.get(productId);
    if (loc) {
      return loc[locale.value as 'vi' | 'en'] || loc.vi || loc.en;
    }
  } else if (props.productNames && typeof props.productNames === 'object') {
    const loc = (props.productNames as Record<string, LocalizedText>)[productId];
    if (loc) {
      return loc[locale.value as 'vi' | 'en'] || loc.vi || loc.en;
    }
  }

  if (props.products && props.products.length > 0) {
    const p = props.products.find((item) => item._id === productId);
    if (p) {
      return p.name[locale.value as 'vi' | 'en'] || p.name.vi || p.name.en;
    }
  }

  return productId.replace(/^product:/, '');
}

function isComboOptionSelected(groupKey: string, optionId: string): boolean {
  return (selectedOptions.value[groupKey] ?? []).includes(optionId);
}

function isComboOptionDisabled(group: ComboGroup, optionId: string): boolean {
  const current = selectedOptions.value[group.key] ?? [];
  if (current.includes(optionId)) return false;
  return group.maxSelect > 1 && current.length >= group.maxSelect;
}

function selectComboOption(group: ComboGroup, optionId: string) {
  const current = selectedOptions.value[group.key] ?? [];
  const idx = current.indexOf(optionId);

  if (idx >= 0) {
    // Nếu maxSelect > 1 thì cho phép huỷ chọn (nếu lớn hơn minSelect)
    if (group.maxSelect > 1) {
      selectedOptions.value[group.key] = current.filter((id) => id !== optionId);
    }
  } else {
    if (group.maxSelect === 1) {
      selectedOptions.value[group.key] = [optionId];
    } else if (current.length < group.maxSelect) {
      selectedOptions.value[group.key] = [...current, optionId];
    }
  }
}

const basePrice = computed<Money>(() => {
  return props.combo?.basePrice ?? money(0, 'VND');
});

const calculatedPriceDelta = computed<Money>(() => {
  let delta = money(0, basePrice.value.currency);
  if (!props.combo) return delta;

  for (const group of props.combo.comboGroups) {
    const selectedIds = selectedOptions.value[group.key] ?? [];
    for (const optId of selectedIds) {
      const opt = group.options.find((o) => o.optionId === optId);
      if (opt) {
        delta = add(delta, opt.priceDelta);
      }
    }
  }
  return delta;
});

const totalPrice = computed<Money>(() => {
  return add(basePrice.value, calculatedPriceDelta.value);
});

const canConfirm = computed(() => {
  if (!props.combo) return false;
  for (const group of props.combo.comboGroups) {
    const count = (selectedOptions.value[group.key] ?? []).length;
    if (count < group.minSelect) return false;
    if (count > group.maxSelect) return false;
  }
  return true;
});

function handleConfirm() {
  if (!props.combo || !canConfirm.value) return;

  const comboSelections: ComboSelection[] = props.combo.comboGroups.map((group) => ({
    groupKey: group.key,
    optionIds: [...(selectedOptions.value[group.key] ?? [])],
  }));

  const item: OrderLineItem = {
    lineId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    productId: props.combo._id,
    nameSnapshot: { vi: props.combo.name.vi, en: props.combo.name.en },
    unitPriceSnapshot: totalPrice.value,
    comboSelections,
    comboPriceDelta: calculatedPriceDelta.value,
    qty: 1,
    modifiers: [],
    status: 'placed',
    addedAt: new Date().toISOString(),
  };

  emit('confirm', item);
  isOpen.value = false;
}
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto"
      data-test="combo-picker-modal"
    >
      <!-- Tiêu đề modal -->
      <div class="border-b border-border pb-3">
        <Dialog.Title class="text-lg font-bold text-text">
          {{ combo?.name?.[locale as 'vi' | 'en'] || combo?.name?.vi || combo?.name?.en }}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-text-muted mt-1">
          {{ t('pos.combo.title') }}
        </Dialog.Description>
      </div>

      <!-- Danh sách nhóm lựa chọn của Combo -->
      <div
        v-for="group in combo?.comboGroups"
        :key="group.key"
        class="space-y-2.5 border-t border-border pt-4"
        :data-combo-group-key="group.key"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {{ group.label[locale as 'vi' | 'en'] || group.label.vi || group.label.en }}
          </span>
          <div class="flex items-center gap-2 text-xs text-text-muted">
            <span v-if="group.minSelect > 0" class="text-primary font-medium">
              {{ t('pos.options.selectMin', { count: group.minSelect }) }}
            </span>
            <span v-if="group.maxSelect > 0">
              {{ t('pos.options.selectMax', { count: group.maxSelect }) }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="opt in group.options"
            :key="opt.optionId"
            class="flex items-center"
          >
            <Button.Root
              type="button"
              :data-combo-option-id="opt.optionId"
              :data-selected="isComboOptionSelected(group.key, opt.optionId) ? '' : undefined"
              :disabled="isComboOptionDisabled(group, opt.optionId)"
              :data-disabled="isComboOptionDisabled(group, opt.optionId) ? '' : undefined"
              class="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-border cursor-pointer transition-all hover:bg-bg disabled:(opacity-50 cursor-not-allowed) selected:(border-primary bg-primary/5 text-primary shadow-xs)"
              @click="selectComboOption(group, opt.optionId)"
            >
              <div class="flex items-center gap-2.5">
                <span
                  class="w-4 h-4 rounded-full border border-border flex items-center justify-center text-xs"
                  :class="isComboOptionSelected(group.key, opt.optionId) ? 'border-primary bg-primary text-primary-contrast' : ''"
                >
                  <span
                    v-if="isComboOptionSelected(group.key, opt.optionId)"
                    class="w-1.5 h-1.5 rounded-full bg-primary-contrast block"
                  />
                </span>
                <span class="text-sm font-medium">
                  {{ resolveProductName(opt.productId) }}
                </span>
              </div>
              <span class="text-xs font-medium text-text-muted">
                {{ opt.priceDelta.minor > 0 ? `+${format(opt.priceDelta)}` : (opt.priceDelta.minor < 0 ? format(opt.priceDelta) : '') }}
              </span>
            </Button.Root>
          </div>
        </div>
      </div>

      <!-- Nút hành động: Huỷ và Xác nhận (kèm giá) -->
      <div class="border-t border-border pt-4 flex items-center justify-end gap-3">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-3 py-2 cursor-pointer"
          data-test="cancel-combo-btn"
          @click="isOpen = false"
        >
          {{ t('pos.options.cancel') }}
        </Button.Root>

        <Button.Root
          type="button"
          class="btn btn-primary text-xs px-4 py-2 flex items-center gap-2 cursor-pointer disabled:(opacity-50 cursor-not-allowed)"
          data-test="confirm-combo-btn"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          <span>{{ t('pos.options.confirm') }}</span>
          <span>•</span>
          <span data-test="combo-total-price" class="font-bold">
            {{ format(totalPrice) }}
          </span>
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
