<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, Select } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import { DEFAULT_BRANCH_ID } from '@/core/db/branch';
import { createOrderRepository } from '@/core/order/order-repository';

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
  }>(),
  {
    branchId: DEFAULT_BRANCH_ID,
  },
);

const emit = defineEmits<{
  (e: 'open-bank-settings'): void;
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

defineExpose({
  orderRepository,
  mode,
  terminalCode,
  cashierName,
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
          @click="emit('open-bank-settings')"
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
          class="floor-plan-panel flex-1 panel-card flex flex-col"
          data-test="floor-plan-panel"
        >
          <slot name="floor-plan">
            <div class="p-6 text-center text-text-muted my-auto">
              <p class="font-medium text-base text-text">{{ t('pos.mode.floor') }}</p>
              <p class="text-sm mt-1">Khung sơ đồ bàn (Floor Plan UI) sẽ được gắn tại Task 9.</p>
            </div>
          </slot>
        </div>
        <div
          v-else
          class="fast-sale-panel flex-1 panel-card flex flex-col"
          data-test="fast-sale-panel"
        >
          <slot name="fast-sale">
            <div class="p-6 text-center text-text-muted my-auto">
              <p class="font-medium text-base text-text">{{ t('pos.mode.fastSale') }}</p>
              <p class="text-sm mt-1">Khung chọn món bán nhanh (Catalog Picker) sẽ được gắn tại Task 10.</p>
            </div>
          </slot>
        </div>
      </section>

      <!-- Cột phải (40% trên màn hình desktop): Chi tiết hoá đơn và thao tác thanh toán -->
      <section
        class="pos-right-panel md:w-[40%] flex flex-col p-4 border-t md:border-t-0 md:border-l border-border overflow-y-auto min-h-0"
      >
        <div class="ticket-panel flex-1 panel-card flex flex-col" data-test="ticket-panel">
          <slot name="ticket">
            <div class="p-6 text-center text-text-muted my-auto">
              <p class="font-medium text-base text-text">{{ t('pos.ticket.title') }}</p>
              <p class="text-sm mt-1">
                Khung hoá đơn / đơn hàng (Order Ticket Panel) sẽ được gắn tại Task 11.
              </p>
            </div>
          </slot>
        </div>
      </section>
    </div>
  </div>
</template>
