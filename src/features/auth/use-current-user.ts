import { ref, computed } from 'vue';
import type { UserDoc, UserRole } from '@/core/auth/types';
import {
  generateSessionToken,
  verifySessionToken,
  verifyPin,
  verifyPassword,
  checkAuthRateLimit,
  recordFailedAuthAttempt,
  resetAuthAttempts,
} from '@/core/auth/token';
import {
  hasPermission as checkPermission,
  type Permission,
} from '@/core/auth/permissions';
import type { UserRepository, UpsertLogtoUserInput } from '@/core/auth/user-repository';

const currentUser = ref<UserDoc | null>(null);
const sessionToken = ref<string | null>(null);

export const SESSION_STORAGE_KEY = 'openpos_user_session';

export function useCurrentUser() {
  const isOwner = computed(() => currentUser.value?.role === 'owner');
  const isManager = computed(() => currentUser.value?.role === 'manager' || isOwner.value);
  const activeRole = computed<UserRole | null>(() => currentUser.value?.role ?? null);
  const isAuthenticated = computed(() => currentUser.value !== null && sessionToken.value !== null);

  function canAccessBranch(branchId: string): boolean {
    if (!currentUser.value) return false;
    if (currentUser.value.role === 'owner') return true;
    return currentUser.value.branchIds.includes(branchId);
  }

  function hasPermission(permission: Permission, branchId?: string): boolean {
    return checkPermission(currentUser.value, permission, branchId ? { branchId } : undefined);
  }

  function can(permission: Permission, branchId?: string): boolean {
    return hasPermission(permission, branchId);
  }

  function setUser(
    user: UserDoc,
    activeBranchId: string,
    secret: string = 'openpos_lan_secret_default',
  ): string {
    currentUser.value = user;
    const token = generateSessionToken(user, activeBranchId, secret);
    sessionToken.value = token;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          SESSION_STORAGE_KEY,
          JSON.stringify({ user, activeBranchId, token }),
        );
      }
    } catch {
      // Ignore storage errors in test / incognito
    }
    return token;
  }

  function restoreSession(secret: string = 'openpos_lan_secret_default'): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.user || !data.token) {
        logout();
        return false;
      }
      const claims = verifySessionToken(data.token, secret);
      if (!claims) {
        logout();
        return false;
      }
      currentUser.value = data.user;
      sessionToken.value = data.token;
      return true;
    } catch {
      logout();
      return false;
    }
  }

  async function login(
    user: UserDoc,
    pinOrPassword: string,
    activeBranchId: string,
    secret: string = 'openpos_lan_secret_default',
  ): Promise<{ success: boolean; error?: string }> {
    const rateLimit = checkAuthRateLimit(user._id);
    if (!rateLimit.allowed) {
      return {
        success: false,
        error: `locked_out:${rateLimit.remainingLockoutSeconds}`,
      };
    }

    let valid = false;
    if (user.passwordHash && verifyPassword(pinOrPassword, user.passwordHash)) {
      valid = true;
    } else if (user.pinHash && verifyPin(pinOrPassword, user.pinHash)) {
      valid = true;
    }

    if (!valid) {
      recordFailedAuthAttempt(user._id);
      return { success: false, error: 'invalid_credentials' };
    }

    resetAuthAttempts(user._id);
    setUser(user, activeBranchId, secret);
    return { success: true };
  }

  async function loginWithLocal(
    repo: UserRepository,
    username: string,
    passwordOrPin: string,
    activeBranchId: string,
    secret: string = 'openpos_lan_secret_default',
  ): Promise<{ success: boolean; user?: UserDoc; error?: string }> {
    const res = await repo.authenticateLocal(username, passwordOrPin);
    if (!res.success || !res.user) {
      return res;
    }
    setUser(res.user, activeBranchId, secret);
    return { success: true, user: res.user };
  }

  async function loginWithLogto(
    repo: UserRepository,
    logtoProfile: UpsertLogtoUserInput,
    activeBranchId: string,
    secret: string = 'openpos_lan_secret_default',
  ): Promise<{ success: boolean; user: UserDoc }> {
    const user = await repo.upsertLogtoUser(logtoProfile);
    setUser(user, activeBranchId, secret);
    return { success: true, user };
  }

  function logout() {
    currentUser.value = null;
    sessionToken.value = null;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  }

  return {
    currentUser,
    sessionToken,
    isOwner,
    isManager,
    activeRole,
    isAuthenticated,
    canAccessBranch,
    hasPermission,
    can,
    setUser,
    restoreSession,
    login,
    loginWithLocal,
    loginWithLogto,
    logout,
  };
}
