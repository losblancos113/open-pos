// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { useCurrentUser } from '../use-current-user';
import { hashPin, hashPassword } from '@/core/auth/token';
import type { UserDoc } from '@/core/auth/types';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createUserRepository } from '@/core/auth/user-repository';

describe('useCurrentUser', () => {
  const {
    currentUser,
    sessionToken,
    isOwner,
    isManager,
    isAuthenticated,
    canAccessBranch,
    can,
    hasPermission,
    login,
    loginWithLocal,
    loginWithLogto,
    logout,
  } = useCurrentUser();

  const cashier: UserDoc = {
    _id: 'user:c1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'cashier1',
    displayName: 'Thu ngân 1',
    pinHash: hashPin('1234'),
    role: 'cashier',
    branchIds: ['hq'],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  const owner: UserDoc = {
    _id: 'user:owner1',
    docType: 'user',
    branchId: GLOBAL_BRANCH_ID,
    username: 'admin',
    displayName: 'Chủ quán',
    passwordHash: hashPassword('AdminPass2026!'),
    pinHash: hashPin('8888'),
    role: 'owner',
    branchIds: [],
    isActive: true,
    schemaVersion: 1,
    createdAt: '',
    updatedAt: '',
  };

  beforeEach(() => {
    logout();
  });

  it('logs in with valid PIN and sets current user and session token', async () => {
    const result = await login(cashier, '1234', 'hq', 'test-secret');
    expect(result.success).toBe(true);
    expect(currentUser.value?.username).toBe('cashier1');
    expect(sessionToken.value).toBeTruthy();
    expect(isOwner.value).toBe(false);
    expect(isAuthenticated.value).toBe(true);
    expect(canAccessBranch('hq')).toBe(true);
    expect(canAccessBranch('dist1')).toBe(false);
  });

  it('allows owner to access all branches and perform all permissions', async () => {
    const result = await login(owner, 'AdminPass2026!', 'dist1', 'test-secret');
    expect(result.success).toBe(true);
    expect(isOwner.value).toBe(true);
    expect(canAccessBranch('hq')).toBe(true);
    expect(canAccessBranch('dist1')).toBe(true);
    expect(can('manage_branches')).toBe(true);
    expect(can('view_cross_branch_reports')).toBe(true);
    expect(hasPermission('manage_inventory', 'dist1')).toBe(true);
  });

  it('checks cashier permissions properly', async () => {
    await login(cashier, '1234', 'hq', 'test-secret');
    expect(can('create_order', 'hq')).toBe(true);
    expect(can('manage_shifts', 'hq')).toBe(true);
    expect(can('manage_branches')).toBe(false);
    expect(can('view_cross_branch_reports')).toBe(false);
    expect(can('create_order', 'dist1')).toBe(false); // Not allowed in dist1
  });

  it('fails with invalid PIN or password', async () => {
    const result = await login(cashier, '9999', 'hq', 'test-secret');
    expect(result.success).toBe(false);
    expect(currentUser.value).toBeNull();
    expect(sessionToken.value).toBeNull();
  });

  it('logs in via loginWithLocal and UserRepository', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createUserRepository(adapter);
    await repo.createUser({
      username: 'manager_test',
      displayName: 'Quản lý Test',
      password: 'StrongPassword123!',
      role: 'manager',
      branchIds: ['hq'],
    });

    const res = await loginWithLocal(repo, 'manager_test', 'StrongPassword123!', 'hq');
    expect(res.success).toBe(true);
    expect(currentUser.value?.username).toBe('manager_test');
    expect(isManager.value).toBe(true);
    expect(can('manage_inventory', 'hq')).toBe(true);
  });

  it('logs in via loginWithLogto and JIT provisions user', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createUserRepository(adapter);

    const res = await loginWithLogto(
      repo,
      {
        sub: 'logto_sub_999',
        username: 'logto_admin',
        displayName: 'Logto Admin User',
        email: 'admin@logto.io',
        role: 'owner',
      },
      'hq',
    );

    expect(res.success).toBe(true);
    expect(currentUser.value?.username).toBe('logto_admin');
    expect(currentUser.value?.authProvider).toBe('logto');
    expect(isOwner.value).toBe(true);
  });

  it('restores valid session from localStorage via restoreSession', () => {
    const { setUser, restoreSession } = useCurrentUser();
    setUser(owner, 'hq', 'openpos_lan_secret_default');

    // Simulate page reload: reset in-memory state without clearing localStorage
    currentUser.value = null;
    sessionToken.value = null;
    expect(isAuthenticated.value).toBe(false);

    const restored = restoreSession('openpos_lan_secret_default');
    expect(restored).toBe(true);
    expect((currentUser.value as UserDoc | null)?.username).toBe('admin');
    expect(sessionToken.value).toBeTruthy();
    expect(isAuthenticated.value).toBe(true);
  });

  it('clears session and returns false on restoreSession if token is invalid or expired', () => {
    const { restoreSession } = useCurrentUser();
    localStorage.setItem(
      'openpos_user_session',
      JSON.stringify({ user: cashier, token: 'invalid.token' }),
    );

    const restored = restoreSession();
    expect(restored).toBe(false);
    expect(currentUser.value).toBeNull();
    expect(isAuthenticated.value).toBe(false);
  });
});
