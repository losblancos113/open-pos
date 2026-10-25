import { ref, computed } from 'vue';
import type { UserDoc, UserRole } from '@/core/auth/types';
import {
  generateSessionToken,
  verifyPin,
  checkPinRateLimit,
  recordFailedPinAttempt,
  resetPinAttempts,
} from '@/core/auth/token';

const currentUser = ref<UserDoc | null>(null);
const sessionToken = ref<string | null>(null);

export function useCurrentUser() {
  const isOwner = computed(() => currentUser.value?.role === 'owner');
  const isManager = computed(() => currentUser.value?.role === 'manager' || isOwner.value);
  const activeRole = computed<UserRole | null>(() => currentUser.value?.role ?? null);

  function canAccessBranch(branchId: string): boolean {
    if (!currentUser.value) return false;
    if (currentUser.value.role === 'owner') return true;
    return currentUser.value.branchIds.includes(branchId);
  }

  async function login(
    user: UserDoc,
    pin: string,
    activeBranchId: string,
    secret: string = 'openpos_lan_secret_default',
  ): Promise<{ success: boolean; error?: string }> {
    const rateLimit = checkPinRateLimit(user._id);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `locked_out:${rateLimit.remainingLockoutSeconds}`,
      };
    }

    const valid = verifyPin(pin, user.pinHash);
    if (!valid) {
      recordFailedPinAttempt(user._id);
      return { success: false, error: 'invalid_pin' };
    }

    resetPinAttempts(user._id);
    currentUser.value = user;
    sessionToken.value = generateSessionToken(user, activeBranchId, secret);
    return { success: true };
  }

  function logout() {
    currentUser.value = null;
    sessionToken.value = null;
  }

  return {
    currentUser,
    sessionToken,
    isOwner,
    isManager,
    activeRole,
    canAccessBranch,
    login,
    logout,
  };
}
