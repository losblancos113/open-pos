<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { SettingsOutline } from '@vicons/ionicons5';
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@vuetify/v0';
import type { BranchRepository } from '@/core/branch/branch-repository';
import { useActiveBranch } from './use-active-branch';
import { useCurrentUser } from '@/features/auth/use-current-user';
import BranchAdminModal from './BranchAdminModal.vue';

const props = defineProps<{
  branchRepo: BranchRepository;
}>();

const { t } = useI18n();
const { activeBranchId, currentBranch, availableBranches, init, switchBranch } =
  useActiveBranch(props.branchRepo);
const { currentUser, isOwner, isManager, canAccessBranch } = useCurrentUser();

const isAdminModalOpen = ref(false);

onMounted(async () => {
  await init();
});

watch(
  () => props.branchRepo,
  async () => {
    await init();
  },
);

const authorizedBranches = computed(() => {
  if (isOwner.value) return availableBranches.value;
  return availableBranches.value.filter((b) =>
    canAccessBranch(b.code.toLowerCase()) || canAccessBranch(b._id.replace('branch:', '')),
  );
});

const canSwitch = computed(() => {
  if (isOwner.value || isManager.value) return true;
  return authorizedBranches.value.length > 1;
});

async function onBranchChange(event: Event) {
  const targetId = (event.target as HTMLSelectElement).value;
  if (!targetId || targetId === activeBranchId.value) return;
  try {
    await switchBranch(targetId);
  } catch (err) {
    console.error('Failed to switch branch:', err);
  }
}
</script>

<template>
  <div class="inline-flex items-center gap-2">
    <!-- Single-branch static badge -->
    <div
      v-if="!canSwitch"
      data-test="branch-badge"
      class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface border border-border text-xs font-medium text-text select-none shadow-sm"
    >
      <span class="w-2 h-2 rounded-full bg-primary"></span>
      <span>{{ currentBranch?.name || activeBranchId.toUpperCase() }}</span>
    </div>

    <!-- Multi-branch or Manager/Owner Switcher Dropdown -->
    <div v-else class="relative inline-flex items-center">
      <select
        :value="activeBranchId"
        data-test="branch-select"
        class="field-input text-xs py-1 px-2.5 rounded bg-surface border border-border font-medium text-text cursor-pointer hover:border-primary shadow-sm"
        @change="onBranchChange"
      >
        <option
          v-for="b in authorizedBranches"
          :key="b._id"
          :value="b.code.toLowerCase()"
        >
          {{ b.name }} ({{ b.code }})
        </option>
      </select>
    </div>

    <!-- Admin Settings Button for Owner -->
    <Button.Root
      v-if="isOwner"
      type="button"
      data-test="branch-admin-btn"
      class="btn btn-ghost text-xs p-1.5 rounded hover:bg-surface border border-transparent hover:border-border"
      :title="t('branch.manage')"
      @click="isAdminModalOpen = true"
    >
      <Button.Content>
        <span class="sr-only">{{ t('branch.manage') }}</span>
        <AppIcon><SettingsOutline /></AppIcon>
      </Button.Content>
    </Button.Root>

    <!-- Branch Admin Modal -->
    <BranchAdminModal
      :open="isAdminModalOpen"
      :branch-repo="branchRepo"
      @close="isAdminModalOpen = false"
      @branch-saved="init"
    />
  </div>
</template>
