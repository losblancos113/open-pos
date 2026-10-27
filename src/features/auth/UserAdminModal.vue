<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from '@vuetify/v0';
import type { UserDoc, UserRole } from '@/core/auth/types';
import type { UserRepository } from '@/core/auth/user-repository';
import type { BranchRepository } from '@/core/branch/branch-repository';
import type { BranchDoc } from '@/core/branch/types';

const props = withDefaults(
  defineProps<{
    open?: boolean;
    userRepo: UserRepository;
    branchRepo: BranchRepository;
  }>(),
  {
    open: false,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const users = ref<UserDoc[]>([]);
const branches = ref<BranchDoc[]>([]);
const isLoading = ref<boolean>(false);
const errorMessage = ref<string | null>(null);
const successMessage = ref<string | null>(null);

// Form mode
const isAddingUser = ref<boolean>(false);
const editingUser = ref<UserDoc | null>(null);

// Add form state
const newUsername = ref<string>('');
const newDisplayName = ref<string>('');
const newPassword = ref<string>('');
const newPin = ref<string>('');
const newRole = ref<UserRole>('cashier');
const newBranchIds = ref<string[]>([]);

// Edit form state
const editDisplayName = ref<string>('');
const editPassword = ref<string>('');
const editPin = ref<string>('');
const editRole = ref<UserRole>('cashier');
const editBranchIds = ref<string[]>([]);
const editIsActive = ref<boolean>(true);

async function loadData() {
  isLoading.value = true;
  try {
    const [userList, branchList] = await Promise.all([
      props.userRepo.listUsers({ includeInactive: true }),
      props.branchRepo.listBranches({ includeInactive: true }),
    ]);
    users.value = userList;
    branches.value = branchList;
  } catch (err: any) {
    errorMessage.value = err.message || t('common.error');
  } finally {
    isLoading.value = false;
  }
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      isAddingUser.value = false;
      editingUser.value = null;
      errorMessage.value = null;
      successMessage.value = null;
      loadData();
    }
  },
  { immediate: true },
);

function openAddUserForm() {
  newUsername.value = '';
  newDisplayName.value = '';
  newPassword.value = '';
  newPin.value = '';
  newRole.value = 'cashier';
  newBranchIds.value = branches.value.length > 0 && branches.value[0] ? [branches.value[0].code.toLowerCase()] : [];
  editingUser.value = null;
  isAddingUser.value = true;
  errorMessage.value = null;
}

function openEditUserForm(user: UserDoc) {
  editingUser.value = user;
  editDisplayName.value = user.displayName;
  editPassword.value = '';
  editPin.value = '';
  editRole.value = user.role;
  editBranchIds.value = [...user.branchIds];
  editIsActive.value = user.isActive;
  isAddingUser.value = false;
  errorMessage.value = null;
}

function toggleNewBranch(branchId: string) {
  const idx = newBranchIds.value.indexOf(branchId);
  if (idx > -1) {
    newBranchIds.value.splice(idx, 1);
  } else {
    newBranchIds.value.push(branchId);
  }
}

function toggleEditBranch(branchId: string) {
  const idx = editBranchIds.value.indexOf(branchId);
  if (idx > -1) {
    editBranchIds.value.splice(idx, 1);
  } else {
    editBranchIds.value.push(branchId);
  }
}

async function handleCreateUser() {
  errorMessage.value = null;
  if (!newUsername.value.trim()) {
    errorMessage.value = 'Tên đăng nhập không được để trống';
    return;
  }
  if (!newPassword.value || newPassword.value.length < 6) {
    errorMessage.value = 'Mật khẩu phải có ít nhất 6 ký tự';
    return;
  }

  try {
    await props.userRepo.createUser({
      username: newUsername.value.trim(),
      displayName: newDisplayName.value.trim() || newUsername.value.trim(),
      password: newPassword.value,
      pin: newPin.value.trim() || undefined,
      role: newRole.value,
      branchIds: newBranchIds.value,
      authProvider: 'local',
      isActive: true,
    });

    successMessage.value = 'Thêm người dùng thành công';
    isAddingUser.value = false;
    await loadData();
  } catch (err: any) {
    errorMessage.value = err.message || t('common.error');
  }
}

async function handleSaveEditUser() {
  if (!editingUser.value) return;
  errorMessage.value = null;

  try {
    await props.userRepo.updateUser(editingUser.value._id, {
      displayName: editDisplayName.value.trim() || editingUser.value.username,
      password: editPassword.value ? editPassword.value : undefined,
      pin: editPin.value.trim() ? editPin.value.trim() : undefined,
      role: editRole.value,
      branchIds: editBranchIds.value,
      isActive: editIsActive.value,
    });

    successMessage.value = 'Cập nhật thông tin thành công';
    editingUser.value = null;
    await loadData();
  } catch (err: any) {
    errorMessage.value = err.message || t('common.error');
  }
}
</script>

<template>
  <div
    v-if="open"
    data-test="user-admin-modal"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto"
  >
    <div class="panel-card w-full max-w-3xl p-6 space-y-4 shadow-2xl flex flex-col bg-surface border border-border rounded-xl max-h-[90vh]">
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-3 border-border shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-xl">👥</span>
          <h2 class="text-base font-bold text-text">{{ t('auth.userManagement') }}</h2>
        </div>
        <Button.Root
          type="button"
          data-test="close-user-admin-btn"
          class="btn btn-ghost text-xs px-2.5 py-1"
          @click="emit('close')"
        >
          <Button.Content>✕ {{ t('common.close') }}</Button.Content>
        </Button.Root>
      </div>

      <!-- Feedback messages -->
      <div
        v-if="errorMessage"
        data-test="user-admin-error"
        class="p-2.5 text-xs text-danger bg-danger/10 border border-danger/20 rounded-md flex justify-between items-center"
      >
        <span>⚠️ {{ errorMessage }}</span>
        <button type="button" class="text-danger hover:underline font-bold" @click="errorMessage = null">✕</button>
      </div>

      <div
        v-if="successMessage"
        data-test="user-admin-success"
        class="p-2.5 text-xs text-success bg-success/10 border border-success/20 rounded-md flex justify-between items-center"
      >
        <span>✅ {{ successMessage }}</span>
        <button type="button" class="text-success hover:underline font-bold" @click="successMessage = null">✕</button>
      </div>

      <!-- Main Action: Add User button (when not editing/adding) -->
      <div v-if="!isAddingUser && !editingUser" class="flex justify-between items-center shrink-0">
        <span class="text-xs text-text-muted">Tổng cộng: {{ users.length }} tài khoản</span>
        <Button.Root
          type="button"
          data-test="open-add-user-btn"
          class="btn btn-primary text-xs px-3 py-1.5 font-bold flex items-center gap-1.5"
          @click="openAddUserForm"
        >
          <Button.Content>
            <span>➕</span>
            <span>{{ t('auth.addUser') }}</span>
          </Button.Content>
        </Button.Root>
      </div>

      <!-- ADD USER FORM -->
      <div
        v-if="isAddingUser"
        class="p-4 rounded-xl border border-border bg-surface-muted/60 space-y-3.5 overflow-y-auto"
      >
        <div class="flex items-center justify-between border-b border-border pb-2">
          <h3 class="text-sm font-bold text-text">➕ {{ t('auth.addUser') }}</h3>
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs py-1 px-2"
            @click="isAddingUser = false"
          >
            <Button.Content>{{ t('common.cancel') }}</Button.Content>
          </Button.Root>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.username') }} <span class="text-danger">*</span>
            </label>
            <Input.Root v-model="newUsername" class="w-full">
              <Input.Control
                data-test="new-username-input"
                class="field-input w-full bg-surface"
                placeholder="cashier_q1"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.displayName') }}
            </label>
            <Input.Root v-model="newDisplayName" class="w-full">
              <Input.Control
                data-test="new-display-name-input"
                class="field-input w-full bg-surface"
                placeholder="Thu ngân Q1"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.password') }} <span class="text-danger">*</span>
            </label>
            <Input.Root v-model="newPassword" type="password" class="w-full">
              <Input.Control
                data-test="new-password-input"
                type="password"
                class="field-input w-full bg-surface"
                placeholder="••••••••"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.pin') }} (4-6 số)
            </label>
            <Input.Root v-model="newPin" type="password" class="w-full">
              <Input.Control
                data-test="new-pin-input"
                type="password"
                maxlength="6"
                class="field-input w-full bg-surface"
                placeholder="1234"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              Vai trò (Role)
            </label>
            <select
              v-model="newRole"
              data-test="new-role-select"
              class="field-input w-full bg-surface text-xs py-1.5 px-2 rounded-md border border-border"
            >
              <option value="owner">{{ t('auth.role.owner') }}</option>
              <option value="manager">{{ t('auth.role.manager') }}</option>
              <option value="cashier">{{ t('auth.role.cashier') }}</option>
              <option value="waiter">{{ t('auth.role.waiter') }}</option>
              <option value="kitchen">{{ t('auth.role.kitchen') }}</option>
              <option value="staff">{{ t('auth.role.staff') }}</option>
            </select>
          </div>
        </div>

        <!-- Branches assignment -->
        <div>
          <label class="field-label block text-xs font-semibold mb-1.5">
            {{ t('auth.allowedBranches') }}
          </label>
          <div class="flex items-center gap-2 flex-wrap">
            <label
              v-for="b in branches"
              :key="b._id"
              class="flex items-center gap-1.5 text-xs p-1.5 rounded border border-border bg-surface cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="newBranchIds.includes(b.code.toLowerCase())"
                class="accent-primary"
                @change="toggleNewBranch(b.code.toLowerCase())"
              />
              <span>{{ b.name }} ({{ b.code }})</span>
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5"
            @click="isAddingUser = false"
          >
            <Button.Content>{{ t('common.cancel') }}</Button.Content>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="submit-create-user-btn"
            class="btn btn-primary text-xs px-4 py-1.5 font-bold"
            @click="handleCreateUser"
          >
            <Button.Content>{{ t('common.save') }}</Button.Content>
          </Button.Root>
        </div>
      </div>

      <!-- EDIT USER FORM -->
      <div
        v-if="editingUser"
        class="p-4 rounded-xl border border-border bg-surface-muted/60 space-y-3.5 overflow-y-auto"
      >
        <div class="flex items-center justify-between border-b border-border pb-2">
          <h3 class="text-sm font-bold text-text">
            ✏️ {{ t('auth.editUser') }}: <span class="text-primary font-mono">{{ editingUser.username }}</span>
          </h3>
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs py-1 px-2"
            @click="editingUser = null"
          >
            <Button.Content>{{ t('common.cancel') }}</Button.Content>
          </Button.Root>
        </div>

        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.displayName') }}
            </label>
            <Input.Root v-model="editDisplayName" class="w-full">
              <Input.Control
                data-test="edit-display-name-input"
                class="field-input w-full bg-surface"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              Vai trò (Role)
            </label>
            <select
              v-model="editRole"
              data-test="edit-role-select"
              class="field-input w-full bg-surface text-xs py-1.5 px-2 rounded-md border border-border"
            >
              <option value="owner">{{ t('auth.role.owner') }}</option>
              <option value="manager">{{ t('auth.role.manager') }}</option>
              <option value="cashier">{{ t('auth.role.cashier') }}</option>
              <option value="waiter">{{ t('auth.role.waiter') }}</option>
              <option value="kitchen">{{ t('auth.role.kitchen') }}</option>
              <option value="staff">{{ t('auth.role.staff') }}</option>
            </select>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              Đổi mật khẩu mới (Để trống nếu giữ nguyên)
            </label>
            <Input.Root v-model="editPassword" type="password" class="w-full">
              <Input.Control
                data-test="edit-password-input"
                type="password"
                class="field-input w-full bg-surface"
                placeholder="••••••••"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              Đổi mã PIN mới (Để trống nếu giữ nguyên)
            </label>
            <Input.Root v-model="editPin" type="password" class="w-full">
              <Input.Control
                data-test="edit-pin-input"
                type="password"
                maxlength="6"
                class="field-input w-full bg-surface"
                placeholder="••••"
              />
            </Input.Root>
          </div>
          <div>
            <label class="field-label block font-semibold mb-1">
              {{ t('auth.status') }}
            </label>
            <label class="flex items-center gap-2 mt-1">
              <input type="checkbox" v-model="editIsActive" class="accent-primary" />
              <span :class="editIsActive ? 'text-success font-bold' : 'text-danger font-bold'">
                {{ editIsActive ? t('auth.active') : t('auth.inactive') }}
              </span>
            </label>
          </div>
        </div>

        <!-- Branches assignment -->
        <div>
          <label class="field-label block text-xs font-semibold mb-1.5">
            {{ t('auth.allowedBranches') }}
          </label>
          <div class="flex items-center gap-2 flex-wrap">
            <label
              v-for="b in branches"
              :key="b._id"
              class="flex items-center gap-1.5 text-xs p-1.5 rounded border border-border bg-surface cursor-pointer"
            >
              <input
                type="checkbox"
                :checked="editBranchIds.includes(b.code.toLowerCase())"
                class="accent-primary"
                @change="toggleEditBranch(b.code.toLowerCase())"
              />
              <span>{{ b.name }} ({{ b.code }})</span>
            </label>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-border">
          <Button.Root
            type="button"
            class="btn btn-ghost text-xs px-3 py-1.5"
            @click="editingUser = null"
          >
            <Button.Content>{{ t('common.cancel') }}</Button.Content>
          </Button.Root>
          <Button.Root
            type="button"
            data-test="save-edit-user-btn"
            class="btn btn-primary text-xs px-4 py-1.5 font-bold"
            @click="handleSaveEditUser"
          >
            <Button.Content>{{ t('common.save') }}</Button.Content>
          </Button.Root>
        </div>
      </div>

      <!-- USERS TABLE LIST -->
      <div v-if="!isAddingUser && !editingUser" class="overflow-y-auto flex-1 min-h-0 border border-border rounded-lg">
        <table class="w-full text-xs text-left border-collapse">
          <thead class="bg-surface-muted text-text-muted uppercase font-semibold border-b border-border sticky top-0">
            <tr>
              <th class="p-2.5">{{ t('auth.username') }}</th>
              <th class="p-2.5">{{ t('auth.displayName') }}</th>
              <th class="p-2.5">Role</th>
              <th class="p-2.5">{{ t('auth.authProvider') }}</th>
              <th class="p-2.5">{{ t('auth.status') }}</th>
              <th class="p-2.5 text-right">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr
              v-for="u in users"
              :key="u._id"
              class="hover:bg-surface-muted/50 transition-colors"
            >
              <td class="p-2.5 font-mono font-bold text-text">
                {{ u.username }}
              </td>
              <td class="p-2.5 text-text">
                {{ u.displayName }}
              </td>
              <td class="p-2.5">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-primary/10 text-primary uppercase">
                  {{ u.role }}
                </span>
              </td>
              <td class="p-2.5">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-[10px] font-semibold',
                    u.authProvider === 'logto'
                      ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                      : 'bg-surface border border-border text-text-muted',
                  ]"
                >
                  {{ u.authProvider === 'logto' ? 'Logto SSO' : 'Local' }}
                </span>
              </td>
              <td class="p-2.5">
                <span
                  :class="[
                    'px-2 py-0.5 rounded text-[10px] font-semibold',
                    u.isActive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
                  ]"
                >
                  {{ u.isActive ? t('auth.active') : t('auth.inactive') }}
                </span>
              </td>
              <td class="p-2.5 text-right">
                <Button.Root
                  type="button"
                  :data-test="`edit-user-btn-${u.username}`"
                  class="btn btn-ghost text-xs px-2 py-1 text-primary hover:bg-primary/10 rounded"
                  @click="openEditUserForm(u)"
                >
                  <Button.Content>✏️ {{ t('common.edit') }}</Button.Content>
                </Button.Root>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
