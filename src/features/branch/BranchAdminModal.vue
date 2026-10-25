<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@vuetify/v0';
import type { BranchDoc } from '@/core/branch/types';
import type { BranchRepository } from '@/core/branch/branch-repository';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    branchRepo?: BranchRepository;
  }>(),
  {
    open: false,
    branchRepo: undefined,
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
    }
  },
  { immediate: true },
);

async function handleAddBranch() {
  errorMessage.value = null;
  if (!props.branchRepo) return;
  if (!code.value.trim() || !name.value.trim()) {
    errorMessage.value = 'Mã và tên chi nhánh là bắt buộc';
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
    await loadBranches();
    emit('branchSaved', created);
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : String(err);
  }
}
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
  >
    <div class="panel-card w-full max-w-xl p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
      <div class="flex items-center justify-between border-b pb-3 border-border">
        <h2 class="text-lg font-bold text-text">{{ t('branch.manage') }}</h2>
        <Button.Root
          type="button"
          data-test="close-admin-btn"
          class="btn btn-ghost text-xs px-2 py-1"
          @click="emit('close')"
        >
          <Button.Content>{{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- Branch list -->
      <div class="space-y-2">
        <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">Danh sách chi nhánh</h3>
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
        <h3 class="text-xs font-semibold uppercase tracking-wider text-text-muted">{{ t('branch.add') }}</h3>

        <div v-if="errorMessage" class="p-2 text-xs text-danger bg-danger/10 border border-danger/20 rounded">
          {{ errorMessage }}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.code') }} *</label>
            <Input.Root v-model="code" class="w-full">
              <Input.Control
                data-test="branch-code-input"
                class="field-input w-full text-xs py-1.5 px-2 mt-1"
                placeholder="VD: D1"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.name') }} *</label>
            <Input.Root v-model="name" class="w-full">
              <Input.Control
                data-test="branch-name-input"
                class="field-input w-full text-xs py-1.5 px-2 mt-1"
                placeholder="VD: Chi nhánh Quận 1"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.address') }}</label>
            <Input.Root v-model="address" class="w-full">
              <Input.Control
                data-test="branch-address-input"
                class="field-input w-full text-xs py-1.5 px-2 mt-1"
                placeholder="Địa chỉ"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label text-xs font-medium text-text-muted">{{ t('branch.phone') }}</label>
            <Input.Root v-model="phone" class="w-full">
              <Input.Control
                data-test="branch-phone-input"
                class="field-input w-full text-xs py-1.5 px-2 mt-1"
                placeholder="Số điện thoại"
              />
            </Input.Root>
          </div>
        </div>

        <div class="flex justify-end pt-2">
          <Button.Root
            type="button"
            data-test="save-branch-btn"
            class="btn btn-primary text-xs px-3 py-1.5"
            @click="handleAddBranch"
          >
            <Button.Content>{{ t('branch.add') }}</Button.Content>
          </Button.Root>
        </div>
      </div>
    </div>
  </div>
</template>
