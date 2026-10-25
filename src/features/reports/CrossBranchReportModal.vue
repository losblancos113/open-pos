<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { DbAdapter } from '@/core/db/adapter';
import type { BranchRepository } from '@/core/branch/branch-repository';
import { format } from '@/core/money';
import {
  generateCrossBranchReport,
  type CrossBranchReport,
} from '@/core/reports/cross-branch';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    adapter?: DbAdapter | null;
    branchRepo?: BranchRepository | null;
  }>(),
  {
    open: false,
    adapter: null,
    branchRepo: null,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const report = ref<CrossBranchReport | null>(null);
const isLoading = ref(false);
const errorMessage = ref<string | null>(null);

async function loadReport() {
  if (!props.adapter || !props.branchRepo) return;
  isLoading.value = true;
  errorMessage.value = null;

  try {
    report.value = await generateCrossBranchReport(props.adapter, props.branchRepo, {
      actorRole: 'owner',
    });
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadReport();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div class="panel-card w-full max-w-2xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b pb-3 border-border">
        <h2 class="text-lg font-bold text-text">{{ t('report.crossBranch') }}</h2>
        <Button.Root
          type="button"
          data-test="close-report-btn"
          class="btn btn-ghost text-xs px-2 py-1"
          @click="emit('close')"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <div v-if="isLoading" class="p-8 text-center text-sm text-text-muted">
        {{ t('common.loading') }}
      </div>

      <div v-else-if="errorMessage" class="p-4 text-xs text-danger bg-danger/10 border border-danger/20 rounded">
        {{ errorMessage }}
      </div>

      <div v-else-if="report" class="space-y-4">
        <!-- Consolidated summary metrics -->
        <div class="grid grid-cols-2 gap-4">
          <div class="panel-card p-4 bg-primary/5 border border-primary/20 rounded text-center">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">
              {{ t('report.consolidatedRevenue') }}
            </div>
            <div class="text-2xl font-bold text-primary mt-1">
              {{ format(report.consolidatedRevenue) }}
            </div>
          </div>
          <div class="panel-card p-4 bg-surface border border-border rounded text-center">
            <div class="text-xs font-medium text-text-muted uppercase tracking-wider">
              {{ t('report.totalOrders') }}
            </div>
            <div class="text-2xl font-bold text-text mt-1">
              {{ report.totalOrders }}
            </div>
          </div>
        </div>

        <!-- Breakdown by branch -->
        <div class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Doanh thu từng chi nhánh
          </h3>
          <div class="border border-border rounded overflow-hidden">
            <div
              v-for="b in report.branches"
              :key="b.branchId"
              class="flex items-center justify-between p-3 border-b border-border last:border-b-0 hover:bg-surface"
            >
              <div>
                <div class="font-medium text-sm text-text">
                  {{ b.branchName }}
                  <span class="text-xs font-mono font-normal text-text-muted">({{ b.branchCode }})</span>
                </div>
                <div class="text-xs text-text-muted mt-0.5">
                  {{ b.paidBillsCount }} đơn hoàn thành
                </div>
              </div>
              <div class="text-right">
                <div class="font-bold text-sm text-primary">
                  {{ format(b.totalRevenue) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
