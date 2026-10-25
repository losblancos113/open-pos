<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@vuetify/v0';
import type { InventoryRepository } from '@/core/inventory/inventory-repository';
import type { WasteReason } from '@/core/inventory/types';
import { useInventory } from './use-inventory';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    repo?: InventoryRepository | null;
    branchId?: string;
  }>(),
  {
    open: false,
    branchId: 'hq',
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const activeTab = ref<'stock' | 'recipes' | 'movements' | 'waste' | 'stocktake' | 'suppliers'>('stock');
const searchQuery = ref('');
const filterLowStockOnly = ref(false);

// Local state for waste form
const wasteItemId = ref('');
const wasteQty = ref<number>(1);
const wasteReason = ref<WasteReason>('expired');
const wasteNote = ref('');
const wasteSuccessMsg = ref(false);

// Local state for stocktake
const stocktakeCounts = ref<Record<string, number>>({});
const stocktakeSuccessMsg = ref(false);

const inventory = props.repo ? useInventory(props.repo, () => props.branchId) : null;

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen && inventory) {
      inventory.refresh().then(() => {
        // Pre-fill stocktake counts with current balances
        const initial: Record<string, number> = {};
        for (const item of inventory.items.value) {
          const bal = inventory.balances.value.get(item.itemId);
          initial[item.itemId] = bal?.currentQty ?? 0;
        }
        stocktakeCounts.value = initial;
      });
      wasteSuccessMsg.value = false;
      stocktakeSuccessMsg.value = false;
    }
  },
  { immediate: true },
);

const displayedItems = computed(() => {
  if (!inventory) return [];
  const q = searchQuery.value.trim().toLowerCase();
  return inventory.items.value.filter((item) => {
    const bal = inventory.balances.value.get(item.itemId);
    if (filterLowStockOnly.value && (!bal || !bal.isLowStock)) {
      return false;
    }
    if (!q) return true;
    const nameMatch =
      (item.name.vi && item.name.vi.toLowerCase().includes(q)) ||
      (item.name.en && item.name.en.toLowerCase().includes(q));
    const skuMatch = item.sku.toLowerCase().includes(q);
    return nameMatch || skuMatch;
  });
});

async function handleRecordWaste() {
  if (!inventory || !wasteItemId.value || wasteQty.value <= 0) return;
  const item = inventory.items.value.find((i) => i.itemId === wasteItemId.value);
  if (!item) return;

  await inventory.recordWaste({
    itemId: item.itemId,
    qty: Number(wasteQty.value),
    unit: item.unit,
    wasteReason: wasteReason.value,
    ...(wasteNote.value.trim() ? { note: wasteNote.value.trim() } : {}),
    actorId: 'admin_user',
  });

  wasteQty.value = 1;
  wasteNote.value = '';
  wasteSuccessMsg.value = true;
  setTimeout(() => {
    wasteSuccessMsg.value = false;
  }, 3000);
}

async function handleStocktakeSubmit() {
  if (!inventory) return;
  const counts = Object.entries(stocktakeCounts.value).map(([itemId, countedQty]) => ({
    itemId,
    countedQty: Number(countedQty),
  }));

  await inventory.submitStocktake(counts, 'admin_user');
  stocktakeSuccessMsg.value = true;
  setTimeout(() => {
    stocktakeSuccessMsg.value = false;
  }, 3000);
}
</script>

<template>
  <div
    v-if="open"
    data-test="inventory-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  >
    <div class="panel-card w-full max-w-4xl p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto flex flex-col">
      <!-- Modal Header -->
      <div class="flex items-center justify-between border-b pb-3 border-border">
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-text">{{ t('inventory.title') }}</h2>
          <span
            v-if="inventory && inventory.lowStockCount.value > 0"
            data-test="low-stock-counter-badge"
            class="px-2 py-0.5 text-xs font-semibold rounded-full bg-danger/10 text-danger border border-danger/20"
          >
            {{ inventory.lowStockCount.value }} {{ t('inventory.filter.lowStock') }}
          </span>
        </div>
        <Button.Root
          type="button"
          data-test="close-inventory-btn"
          class="btn btn-ghost text-xs px-2.5 py-1"
          @click="emit('close')"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- KPI Summary Cards -->
      <div v-if="inventory" class="grid grid-cols-3 gap-3">
        <div class="border border-border rounded-lg p-3 bg-surface/50">
          <div class="text-xs text-text-muted">{{ t('inventory.kpi.totalItems') }}</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ inventory.items.value.length }}</div>
        </div>
        <div class="border border-border rounded-lg p-3 bg-surface/50">
          <div class="text-xs text-text-muted">{{ t('inventory.kpi.lowStockAlerts') }}</div>
          <div
            class="text-xl font-bold mt-0.5"
            :class="inventory.lowStockCount.value > 0 ? 'text-danger' : 'text-text'"
          >
            {{ inventory.lowStockCount.value }}
          </div>
        </div>
        <div class="border border-border rounded-lg p-3 bg-surface/50">
          <div class="text-xs text-text-muted">{{ t('inventory.tabs.movements') }}</div>
          <div class="text-xl font-bold text-text mt-0.5">{{ inventory.movements.value.length }}</div>
        </div>
      </div>

      <!-- Navigation Tabs -->
      <div class="flex gap-2 border-b border-border pb-2 overflow-x-auto text-sm">
        <button
          type="button"
          data-test="tab-stock"
          :class="activeTab === 'stock' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'stock'"
        >
          {{ t('inventory.tabs.stock') }}
        </button>
        <button
          type="button"
          data-test="tab-recipes"
          :class="activeTab === 'recipes' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'recipes'"
        >
          {{ t('inventory.tabs.recipes') }}
        </button>
        <button
          type="button"
          data-test="tab-movements"
          :class="activeTab === 'movements' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'movements'"
        >
          {{ t('inventory.tabs.movements') }}
        </button>
        <button
          type="button"
          data-test="tab-waste"
          :class="activeTab === 'waste' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'waste'"
        >
          {{ t('inventory.tabs.waste') }}
        </button>
        <button
          type="button"
          data-test="tab-stocktake"
          :class="activeTab === 'stocktake' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'stocktake'"
        >
          {{ t('inventory.tabs.stocktake') }}
        </button>
        <button
          type="button"
          data-test="tab-suppliers"
          :class="activeTab === 'suppliers' ? 'font-bold text-primary border-b-2 border-primary' : 'text-text-muted hover:text-text'"
          class="px-3 py-1.5 transition-colors"
          @click="activeTab = 'suppliers'"
        >
          {{ t('inventory.tabs.suppliers') }}
        </button>
      </div>

      <!-- Tab 1: Stock & Low-Stock Alerts -->
      <div v-if="activeTab === 'stock'" class="space-y-3 flex-1">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-1">
            <Input.Root
              v-model="searchQuery"
              class="w-full max-w-xs"
            >
              <Input.Control
                class="field-input text-xs w-full"
                :placeholder="t('inventory.filter.searchPlaceholder')"
              />
            </Input.Root>
            <label class="flex items-center gap-1.5 text-xs text-text cursor-pointer select-none">
              <input
                v-model="filterLowStockOnly"
                type="checkbox"
                class="rounded border-border"
              />
              {{ t('inventory.filter.lowStock') }}
            </label>
          </div>
        </div>

        <!-- Stock Table -->
        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium">
              <tr>
                <th class="px-3 py-2">{{ t('inventory.item.sku') }}</th>
                <th class="px-3 py-2">{{ t('inventory.item.name') }}</th>
                <th class="px-3 py-2">{{ t('inventory.item.unit') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.item.currentStock') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.item.minThreshold') }}</th>
                <th class="px-3 py-2 text-center">{{ t('inventory.item.status') }}</th>
              </tr>
            </thead>
            <tbody v-if="inventory">
              <tr
                v-for="item in displayedItems"
                :key="item._id"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
              >
                <td class="px-3 py-2.5 font-mono text-text-muted">{{ item.sku }}</td>
                <td class="px-3 py-2.5 font-medium text-text">
                  {{ item.name.vi || item.name.en }}
                </td>
                <td class="px-3 py-2.5 text-text-muted">{{ item.unit }}</td>
                <td
                  class="px-3 py-2.5 text-right font-mono font-semibold"
                  :class="inventory.balances.value.get(item.itemId)?.isLowStock ? 'text-danger' : 'text-text'"
                >
                  {{ inventory.balances.value.get(item.itemId)?.currentQty ?? 0 }}
                </td>
                <td class="px-3 py-2.5 text-right font-mono text-text-muted">
                  {{ item.minThreshold }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  <span
                    v-if="inventory.balances.value.get(item.itemId)?.isLowStock"
                    data-test="low-stock-badge"
                    class="px-2 py-0.5 rounded text-[11px] font-semibold bg-danger/10 text-danger"
                  >
                    {{ t('inventory.item.lowStockBadge') }}
                  </span>
                  <span
                    v-else
                    class="px-2 py-0.5 rounded text-[11px] font-medium bg-primary/10 text-primary"
                  >
                    {{ t('inventory.item.normalBadge') }}
                  </span>
                </td>
              </tr>
              <tr v-if="displayedItems.length === 0">
                <td colspan="6" class="px-3 py-6 text-center text-text-muted">
                  {{ t('inventory.item.empty') }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 2: Recipes (BOM) -->
      <div v-if="activeTab === 'recipes'" class="space-y-3 flex-1">
        <h3 class="text-sm font-semibold text-text">{{ t('inventory.recipe.title') }}</h3>
        <div v-if="inventory && inventory.recipes.value.length > 0" class="space-y-2">
          <div
            v-for="r in inventory.recipes.value"
            :key="r._id"
            class="border border-border rounded-lg p-3 bg-surface/30 space-y-2"
          >
            <div class="flex items-center justify-between text-xs">
              <span class="font-mono font-bold text-primary">{{ r.targetType }}: {{ r.targetId }}</span>
              <span class="text-text-muted">{{ t('inventory.recipe.yield') }}: {{ r.yieldQty }}</span>
            </div>
            <div class="text-xs text-text-muted">
              <span class="font-medium text-text">{{ t('inventory.recipe.ingredients') }}:</span>
              <ul class="list-disc list-inside mt-1 space-y-0.5">
                <li v-for="ing in r.ingredients" :key="ing.itemId">
                  {{ ing.itemId }}: {{ ing.qty }} {{ ing.unit }}
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-text-muted py-6 text-center">
          {{ t('inventory.recipe.empty') }}
        </div>
      </div>

      <!-- Tab 3: Movements Log -->
      <div v-if="activeTab === 'movements'" class="space-y-3 flex-1">
        <h3 class="text-sm font-semibold text-text">{{ t('inventory.movement.title') }}</h3>
        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto max-h-96">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium sticky top-0">
              <tr>
                <th class="px-3 py-2">{{ t('inventory.movement.date') }}</th>
                <th class="px-3 py-2">{{ t('inventory.movement.type') }}</th>
                <th class="px-3 py-2">{{ t('inventory.movement.item') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.movement.delta') }}</th>
                <th class="px-3 py-2">{{ t('inventory.movement.ref') }}</th>
              </tr>
            </thead>
            <tbody v-if="inventory">
              <tr
                v-for="m in inventory.movements.value"
                :key="m._id"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
              >
                <td class="px-3 py-2 font-mono text-text-muted">{{ m.createdAt.slice(0, 19).replace('T', ' ') }}</td>
                <td class="px-3 py-2 font-medium">
                  <span
                    :class="{
                      'text-primary font-bold': m.type === 'purchase',
                      'text-text-muted': m.type === 'sale_deduction',
                      'text-danger font-semibold': m.type === 'waste',
                      'text-warning font-semibold': m.type === 'stocktake' || m.type === 'adjust',
                    }"
                  >
                    {{ t(`inventory.movement.types.${m.type}`) }}
                  </span>
                </td>
                <td class="px-3 py-2 font-mono">{{ m.itemId }}</td>
                <td
                  class="px-3 py-2 text-right font-mono font-bold"
                  :class="m.qtyDelta > 0 ? 'text-primary' : 'text-danger'"
                >
                  {{ m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta }} {{ m.unit }}
                </td>
                <td class="px-3 py-2 font-mono text-text-muted">{{ m.refId || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 4: Waste Form -->
      <div v-if="activeTab === 'waste'" class="space-y-4 flex-1" data-test="waste-form">
        <h3 class="text-sm font-semibold text-text">{{ t('inventory.waste.title') }}</h3>

        <div v-if="wasteSuccessMsg" class="p-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded">
          ✓ {{ t('inventory.waste.submit') }} thành công!
        </div>

        <form class="space-y-3 max-w-md" @submit.prevent="handleRecordWaste">
          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">{{ t('inventory.waste.item') }}</label>
            <select
              v-model="wasteItemId"
              data-test="waste-item-select"
              class="field-input text-xs w-full rounded border border-border p-2 bg-surface"
              required
            >
              <option value="" disabled>-- Chọn nguyên liệu --</option>
              <option v-for="it in (inventory?.items.value || [])" :key="it.itemId" :value="it.itemId">
                {{ it.name.vi || it.name.en }} ({{ it.sku }}) - Tồn: {{ inventory?.balances.value.get(it.itemId)?.currentQty ?? 0 }} {{ it.unit }}
              </option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-text-muted mb-1">{{ t('inventory.waste.qty') }}</label>
              <input
                v-model.number="wasteQty"
                data-test="waste-qty-input"
                type="number"
                min="0.01"
                step="any"
                class="field-input text-xs w-full rounded border border-border p-2"
                required
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-text-muted mb-1">{{ t('inventory.waste.reason') }}</label>
              <select
                v-model="wasteReason"
                class="field-input text-xs w-full rounded border border-border p-2 bg-surface"
              >
                <option value="expired">{{ t('inventory.waste.reasons.expired') }}</option>
                <option value="damaged">{{ t('inventory.waste.reasons.damaged') }}</option>
                <option value="burnt_mistake">{{ t('inventory.waste.reasons.burnt_mistake') }}</option>
                <option value="quality_reject">{{ t('inventory.waste.reasons.quality_reject') }}</option>
                <option value="staff_meal">{{ t('inventory.waste.reasons.staff_meal') }}</option>
                <option value="other">{{ t('inventory.waste.reasons.other') }}</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-text-muted mb-1">{{ t('inventory.waste.note') }}</label>
            <input
              v-model="wasteNote"
              type="text"
              class="field-input text-xs w-full rounded border border-border p-2"
              placeholder="Ghi chú chi tiết nguyên nhân..."
            />
          </div>

          <Button.Root
            type="submit"
            data-test="submit-waste-btn"
            class="btn btn-primary text-xs w-full py-2"
          >
            <Button.Content>{{ t('inventory.waste.submit') }}</Button.Content>
          </Button.Root>
        </form>
      </div>

      <!-- Tab 5: Stocktake Form -->
      <div v-if="activeTab === 'stocktake'" class="space-y-4 flex-1" data-test="stocktake-table">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-text">{{ t('inventory.stocktake.title') }}</h3>
          <Button.Root
            type="button"
            data-test="submit-stocktake-btn"
            class="btn btn-primary text-xs px-3 py-1.5"
            @click="handleStocktakeSubmit"
          >
            <Button.Content>{{ t('inventory.stocktake.submit') }}</Button.Content>
          </Button.Root>
        </div>

        <div v-if="stocktakeSuccessMsg" class="p-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded">
          ✓ {{ t('inventory.stocktake.submit') }} thành công!
        </div>

        <div class="border border-border rounded-lg overflow-hidden overflow-x-auto max-h-96">
          <table class="w-full text-xs text-left">
            <thead class="bg-surface border-b border-border text-text-muted font-medium sticky top-0">
              <tr>
                <th class="px-3 py-2">{{ t('inventory.item.name') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.stocktake.expected') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.stocktake.counted') }}</th>
                <th class="px-3 py-2 text-right">{{ t('inventory.stocktake.variance') }}</th>
              </tr>
            </thead>
            <tbody v-if="inventory">
              <tr
                v-for="it in inventory.items.value"
                :key="it.itemId"
                class="border-b border-border last:border-b-0 hover:bg-surface/50"
              >
                <td class="px-3 py-2.5 font-medium text-text">
                  {{ it.name.vi || it.name.en }}
                  <span class="text-text-muted font-mono">({{ it.unit }})</span>
                </td>
                <td class="px-3 py-2.5 text-right font-mono text-text-muted">
                  {{ inventory.balances.value.get(it.itemId)?.currentQty ?? 0 }}
                </td>
                <td class="px-3 py-2.5 text-right font-mono">
                  <input
                    v-model.number="stocktakeCounts[it.itemId]"
                    type="number"
                    step="any"
                    class="field-input text-xs w-24 text-right rounded border border-border p-1"
                  />
                </td>
                <td
                  class="px-3 py-2.5 text-right font-mono font-bold"
                  :class="{
                    'text-danger': (Number(stocktakeCounts[it.itemId] ?? 0) - (inventory.balances.value.get(it.itemId)?.currentQty ?? 0)) < 0,
                    'text-primary': (Number(stocktakeCounts[it.itemId] ?? 0) - (inventory.balances.value.get(it.itemId)?.currentQty ?? 0)) > 0,
                    'text-text-muted': (Number(stocktakeCounts[it.itemId] ?? 0) - (inventory.balances.value.get(it.itemId)?.currentQty ?? 0)) === 0,
                  }"
                >
                  {{ (Number(stocktakeCounts[it.itemId] ?? 0) - (inventory.balances.value.get(it.itemId)?.currentQty ?? 0)) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Tab 6: Suppliers -->
      <div v-if="activeTab === 'suppliers'" class="space-y-3 flex-1">
        <h3 class="text-sm font-semibold text-text">{{ t('inventory.supplier.title') }}</h3>
        <div v-if="inventory && inventory.suppliers.value.length > 0" class="border border-border rounded-lg overflow-hidden">
          <div
            v-for="s in inventory.suppliers.value"
            :key="s._id"
            class="flex items-center justify-between p-3 border-b border-border last:border-b-0 hover:bg-surface"
          >
            <div>
              <div class="font-medium text-sm text-text">{{ s.name }}</div>
              <div class="text-xs text-text-muted mt-0.5">
                {{ s.contactName || '—' }} · {{ s.phone || '—' }} · {{ s.address || '—' }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-xs text-text-muted py-6 text-center">
          Chưa có nhà cung cấp nào
        </div>
      </div>
    </div>
  </div>
</template>
