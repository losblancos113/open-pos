<script setup lang="ts">
import AppIcon from '@/components/AppIcon.vue';
import { BusinessOutline, Close } from '@vicons/ionicons5';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Dialog, Button, Input } from '@vuetify/v0';
import type { BranchDoc } from '@/core/branch/types';
import type { BranchRepository } from '@/core/branch/branch-repository';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    branchRepo?: BranchRepository;
  }>(),
  {
    open: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'branchSaved', branch: BranchDoc): void;
}>();

const { t } = useI18n();

const branches = ref<BranchDoc[]>([]);
const code = ref('');
const name = ref('');
const address = ref('');
const phone = ref('');
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

async function loadBranches() {
  if (!props.branchRepo) return;
  branches.value = await props.branchRepo.listBranches({ includeInactive: true });
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      loadBranches();
      code.value = '';
      name.value = '';
      address.value = '';
      phone.value = '';
      errorMessage.value = null;
      successMessage.value = null;
    }
  },
  { immediate: true },
);

async function handleAddBranch() {
  errorMessage.value = null;
  successMessage.value = null;
  if (!props.branchRepo) return;
  if (!code.value.trim() || !name.value.trim()) {
    errorMessage.value = t('branch.validationRequired');
    return;
  }

  try {
    const created = await props.branchRepo.createBranch({
      code: code.value.trim(),
      name: name.value.trim(),
      address: address.value.trim(),
      phone: phone.value.trim(),
    });
    code.value = '';
    name.value = '';
    address.value = '';
    phone.value = '';
    successMessage.value = t('branch.addSuccess');
    await loadBranches();
    emit('branchSaved', created);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <Dialog.Root :model-value="open" @update:model-value="emit('close')">
    <Dialog.Content
      class="panel-card max-w-xl w-full p-6 max-h-[90vh] flex flex-col overflow-hidden m-auto shadow-2xl"
      data-test="branch-admin-modal"
    >
      <!-- Dialog Header (Sticky at top) -->
      <div class="flex items-center justify-between border-b pb-3 border-border shrink-0">
        <div>
          <Dialog.Title class="text-lg font-bold text-text flex items-center gap-2">
            <span><AppIcon><BusinessOutline /></AppIcon></span>
            <span>{{ t('branch.manage') }}</span>
          </Dialog.Title>
        </div>
        <Button.Root
          type="button"
          data-test="close-admin-btn"
          class="btn btn-ghost text-xs px-2.5 py-1.5 rounded-md hover:bg-surface cursor-pointer"
          @click="emit('close')"
        >
          <Button.Content><AppIcon><Close /></AppIcon> {{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- Feedback Messages -->
      <div
        v-if="errorMessage"
        class="error-text p-2.5 bg-danger/10 border border-danger/30 rounded-md text-xs shrink-0 flex items-center justify-between"
        role="alert"
        data-test="branch-admin-error"
      >
        <span>{{ errorMessage }}</span>
        <button type="button" class="text-danger hover:underline font-bold" @click="errorMessage = null"><AppIcon><Close /></AppIcon></button>
      </div>

      <div
        v-if="successMessage"
        class="p-2.5 bg-success/10 border border-success/30 text-success rounded-md text-xs shrink-0 flex items-center justify-between"
        role="status"
        data-test="branch-admin-success"
      >
        <span>{{ successMessage }}</span>
        <button type="button" class="text-success hover:underline font-bold" @click="successMessage = null"><AppIcon><Close /></AppIcon></button>
      </div>

      <!-- Scrollable content area -->
      <div class="overflow-y-auto flex-1 min-h-0 space-y-4 py-2 pr-1">
        <!-- Branch list -->
        <div class="space-y-2">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Danh sách chi nhánh ({{ branches.length }})
          </h3>
          <div class="border border-border rounded overflow-hidden">
            <div
              v-for="b in branches"
              :key="b._id"
              class="flex items-center justify-between p-3 border-b border-border last:border-b-0 hover:bg-surface"
            >
              <div>
                <div class="font-medium text-sm text-text">
                  {{ b.name }}
                  <span class="text-xs font-mono font-normal text-text-muted">({{ b.code }})</span>
                </div>
                <div class="text-xs text-text-muted mt-0.5">
                  {{ b.address || 'Chưa có địa chỉ' }} · {{ b.phone || 'Chưa có SĐT' }}
                </div>
              </div>
              <span
                :class="b.isActive ? 'bg-primary/10 text-primary' : 'bg-text-muted/10 text-text-muted'"
                class="text-xs px-2 py-0.5 rounded font-medium"
              >
                {{ b.isActive ? t('branch.statusActive') : t('branch.statusInactive') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Add branch form -->
        <div class="pt-2 border-t border-border space-y-3">
          <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">
            {{ t('branch.add') }}
          </h3>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.code') }} *</label>
              <Input.Root v-model="code" class="w-full">
                <Input.Control
                  data-test="branch-code-input"
                  class="field-input w-full text-xs py-1.5 px-2 mt-1"
                  :placeholder="t('branch.code')"
                />
              </Input.Root>
            </div>
            <div>
              <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.name') }} *</label>
              <Input.Root v-model="name" class="w-full">
                <Input.Control
                  data-test="branch-name-input"
                  class="field-input w-full text-xs py-1.5 px-2 mt-1"
                  :placeholder="t('branch.name')"
                />
              </Input.Root>
            </div>
            <div>
              <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.address') }}</label>
              <Input.Root v-model="address" class="w-full">
                <Input.Control
                  data-test="branch-address-input"
                  class="field-input w-full text-xs py-1.5 px-2 mt-1"
                  :placeholder="t('branch.address')"
                />
              </Input.Root>
            </div>
            <div>
              <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.phone') }}</label>
              <Input.Root v-model="phone" class="w-full">
                <Input.Control
                  data-test="branch-phone-input"
                  class="field-input w-full text-xs py-1.5 px-2 mt-1"
                  :placeholder="t('branch.phone')"
                />
              </Input.Root>
            </div>
          </div>
        </div>
      </div>

      <!-- Action buttons (Sticky at bottom) -->
      <div class="flex items-center justify-end gap-2 pt-3 border-t border-border shrink-0">
        <Button.Root
          type="button"
          data-test="cancel-branch-btn"
          class="btn btn-ghost text-xs px-3 py-1.5 cursor-pointer"
          @click="emit('close')"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
        <Button.Root
          type="button"
          data-test="save-branch-btn"
          class="btn btn-primary text-xs px-3 py-1.5 cursor-pointer"
          @click="handleAddBranch"
        >
          <Button.Content>{{ t('branch.add') }}</Button.Content>
        </Button.Root>
      </div>
    </Dialog.Content>
  </Dialog.Root>
</template>
