<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Checkbox, Dialog, Radio } from '@vuetify/v0';
import type { ProductDoc } from '@/core/catalog/product';
import type { ModifierGroupDoc } from '@/core/catalog/modifier-group';
import type { OrderLineItem, OrderLineModifier } from '@/core/order/types';
import type { Money } from '@/core/money';
import { money, add, format } from '@/core/money';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    modelValue?: boolean;
    product: ProductDoc | null;
    unitPrice?: Money | null;
    modifierGroups?: readonly ModifierGroupDoc[];
  }>(),
  {
    open: false,
    modelValue: false,
    unitPrice: null,
    modifierGroups: () => [],
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

const selectedVariantId = ref<string | null>(null);
const selectedModifiers = ref<Record<string, string[]>>({});

function initSelections() {
  if (!props.product) return;

  // Kích cỡ (Variant): Chọn size đầu tiên theo mặc định
  if (props.product.variants && props.product.variants.length > 0) {
    selectedVariantId.value = props.product.variants[0]?.id ?? null;
  } else {
    selectedVariantId.value = null;
  }

  // Topping (Modifiers): Chọn các option có isDefault = true
  const initialMods: Record<string, string[]> = {};
  for (const group of props.modifierGroups) {
    const defaultIds = group.options.filter((opt) => opt.isDefault).map((opt) => opt.id);
    initialMods[group._id] = defaultIds.slice(0, group.maxSelect);
  }
  selectedModifiers.value = initialMods;
}

watch(
  () => [isOpen.value, props.product],
  ([open]) => {
    if (open) {
      initSelections();
    }
  },
  { immediate: true },
);

const baseUnitPrice = computed<Money>(() => {
  if (props.unitPrice) return props.unitPrice;
  if (props.product?.basePrice) return props.product.basePrice;
  return money(0, 'VND');
});

const calculatedTotalPrice = computed<Money>(() => {
  let total = baseUnitPrice.value;
  if (!props.product) return total;

  // Cộng giá chênh lệch của size/variant
  if (selectedVariantId.value && props.product.variants) {
    const variant = props.product.variants.find((v) => v.id === selectedVariantId.value);
    if (variant) {
      total = add(total, variant.priceDelta);
    }
  }

  // Cộng giá chênh lệch của topping
  for (const group of props.modifierGroups) {
    const selectedIds = selectedModifiers.value[group._id] ?? [];
    for (const optId of selectedIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        total = add(total, opt.priceDelta);
      }
    }
  }

  return total;
});

function isOptionSelected(groupId: string, optionId: string): boolean {
  return (selectedModifiers.value[groupId] ?? []).includes(optionId);
}

function isOptionDisabled(group: ModifierGroupDoc, optionId: string): boolean {
  const current = selectedModifiers.value[group._id] ?? [];
  if (current.includes(optionId)) return false;
  return group.maxSelect > 1 && current.length >= group.maxSelect;
}

function toggleModifierOption(group: ModifierGroupDoc, optionId: string) {
  const current = selectedModifiers.value[group._id] ?? [];
  const idx = current.indexOf(optionId);
  if (idx >= 0) {
    selectedModifiers.value[group._id] = current.filter((id) => id !== optionId);
  } else {
    if (group.maxSelect === 1) {
      selectedModifiers.value[group._id] = [optionId];
    } else if (current.length < group.maxSelect) {
      selectedModifiers.value[group._id] = [...current, optionId];
    }
  }
}

const canConfirm = computed(() => {
  if (!props.product) return false;

  // Nếu món có nhiều kích cỡ thì bắt buộc phải chọn 1 kích cỡ
  if (props.product.variants && props.product.variants.length > 0 && !selectedVariantId.value) {
    return false;
  }

  // Kiểm tra điều kiện minSelect và maxSelect cho từng nhóm topping
  for (const group of props.modifierGroups) {
    const count = (selectedModifiers.value[group._id] ?? []).length;
    if (count < group.minSelect) return false;
    if (count > group.maxSelect) return false;
  }

  return true;
});

function handleConfirm() {
  if (!props.product || !canConfirm.value) return;

  const variant = props.product.variants?.find((v) => v.id === selectedVariantId.value);
  const modifiersList: OrderLineModifier[] = [];

  for (const group of props.modifierGroups) {
    const selectedIds = selectedModifiers.value[group._id] ?? [];
    for (const optId of selectedIds) {
      const opt = group.options.find((o) => o.id === optId);
      if (opt) {
        modifiersList.push({
          groupId: group._id,
          groupNameSnapshot: group.name[locale.value as 'vi' | 'en'] || group.name.vi || group.name.en,
          optionId: opt.id,
          optionNameSnapshot: opt.name[locale.value as 'vi' | 'en'] || opt.name.vi || opt.name.en,
          priceDelta: opt.priceDelta,
        });
      }
    }
  }

  const lineItem: OrderLineItem = {
    lineId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `line_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    productId: props.product._id,
    nameSnapshot: { vi: props.product.name.vi, en: props.product.name.en },
    unitPriceSnapshot: calculatedTotalPrice.value,
    ...(variant ? { variantId: variant.id, variantNameSnapshot: variant.name.vi || variant.name.en } : {}),
    qty: 1,
    modifiers: modifiersList,
    status: 'placed',
    addedAt: new Date().toISOString(),
  };

  emit('confirm', lineItem);
  isOpen.value = false;
}
</script>

<template>
  <Dialog.Root v-model="isOpen">
    <Dialog.Content
      class="panel-card max-w-lg w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto m-auto"
      data-test="modifier-picker-modal"
    >
      <!-- Tiêu đề modal -->
      <div class="border-b border-border pb-3">
        <Dialog.Title class="text-lg font-bold text-text">
          {{ product?.name?.[locale as 'vi' | 'en'] || product?.name?.vi || product?.name?.en }}
        </Dialog.Title>
        <Dialog.Description class="text-xs text-text-muted mt-1">
          {{ t('pos.options.title') }}
        </Dialog.Description>
      </div>

      <!-- Lựa chọn kích cỡ (Variants) -->
      <div
        v-if="product?.variants && product.variants.length > 0"
        class="space-y-2.5"
        data-test="variant-section"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {{ t('pos.options.size') }}
          </span>
          <span class="text-xs text-primary font-medium">
            {{ t('pos.options.required') }}
          </span>
        </div>

        <Radio.Group
          v-model="selectedVariantId"
          mandatory
          class="grid grid-cols-1 sm:grid-cols-2 gap-2"
        >
          <div
            v-for="v in product.variants"
            :key="v.id"
            class="flex items-center"
          >
            <Radio.Root
              :value="v.id"
              :data-variant-id="v.id"
              class="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-border cursor-pointer transition-all hover:bg-bg selected:(border-primary bg-primary/5 text-primary shadow-xs)"
            >
              <div class="flex items-center gap-2.5">
                <Radio.Indicator class="w-4 h-4 rounded-full border border-border flex items-center justify-center selected:(border-primary)">
                  <span class="w-2 h-2 rounded-full bg-primary block" />
                </Radio.Indicator>
                <span class="text-sm font-medium">
                  {{ v.name[locale as 'vi' | 'en'] || v.name.vi || v.name.en }}
                </span>
              </div>
              <span class="text-xs font-medium text-text-muted">
                {{ v.priceDelta.minor > 0 ? `+${format(v.priceDelta)}` : (v.priceDelta.minor < 0 ? format(v.priceDelta) : '') }}
              </span>
            </Radio.Root>
          </div>
        </Radio.Group>
      </div>

      <!-- Danh sách nhóm topping (Modifier groups) -->
      <div
        v-for="group in modifierGroups"
        :key="group._id"
        class="space-y-2.5 border-t border-border pt-4"
        :data-modifier-group-id="group._id"
      >
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {{ group.name[locale as 'vi' | 'en'] || group.name.vi || group.name.en }}
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
            :key="opt.id"
            class="flex items-center"
          >
            <Checkbox.Root
              :value="opt.id"
              :checked="isOptionSelected(group._id, opt.id)"
              :data-option-id="opt.id"
              :disabled="isOptionDisabled(group, opt.id)"
              :data-disabled="isOptionDisabled(group, opt.id) ? '' : undefined"
              :data-selected="isOptionSelected(group._id, opt.id) ? '' : undefined"
              class="w-full flex items-center justify-between gap-2 p-3 rounded-lg border border-border cursor-pointer transition-all hover:bg-bg disabled:(opacity-50 cursor-not-allowed) selected:(border-primary bg-primary/5 text-primary shadow-xs)"
              @click="toggleModifierOption(group, opt.id)"
            >
              <div class="flex items-center gap-2.5">
                <Checkbox.Indicator class="w-4 h-4 rounded border border-border flex items-center justify-center text-xs selected:(border-primary bg-primary text-primary-contrast)">
                  <span v-if="isOptionSelected(group._id, opt.id)">✓</span>
                </Checkbox.Indicator>
                <span class="text-sm font-medium">
                  {{ opt.name[locale as 'vi' | 'en'] || opt.name.vi || opt.name.en }}
                </span>
              </div>
              <span class="text-xs font-medium text-text-muted">
                {{ opt.priceDelta.minor > 0 ? `+${format(opt.priceDelta)}` : (opt.priceDelta.minor < 0 ? format(opt.priceDelta) : '') }}
              </span>
            </Checkbox.Root>
          </div>
        </div>
      </div>

      <!-- Nút hành động: Huỷ và Xác nhận (kèm giá) -->
      <div class="border-t border-border pt-4 flex items-center justify-end gap-3">
        <Button.Root
          type="button"
          class="btn btn-ghost text-xs px-3 py-2 cursor-pointer"
          data-test="cancel-modifier-btn"
          @click="isOpen = false"
        >
          {{ t('pos.options.cancel') }}
        </Button.Root>

        <Button.Root
          type="button"
          class="btn btn-primary text-xs px-4 py-2 flex items-center gap-2 cursor-pointer disabled:(opacity-50 cursor-not-allowed)"
          data-test="confirm-modifier-btn"
          :disabled="!canConfirm"
          @click="handleConfirm"
        >
          <span>{{ t('pos.options.confirm') }}</span>
          <span>•</span>
          <span data-test="modal-total-price" class="font-bold">
            {{ format(calculatedTotalPrice) }}
          </span>
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
