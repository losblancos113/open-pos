import { describe, it, expect, beforeEach } from 'vitest';
import { useCurrentUser } from '../use-current-user';
import { hashPin } from '@/core/auth/token';
import type { UserDoc } from '@/core/auth/types';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';

describe('useCurrentUser', () => {
  const { currentUser, sessionToken, isOwner, canAccessBranch, login, logout } = useCurrentUser();

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
    expect(canAccessBranch('hq')).toBe(true);
    expect(canAccessBranch('dist1')).toBe(false);
  });

  it('allows owner to access all branches', async () => {
    const result = await login(owner, '8888', 'dist1', 'test-secret');
    expect(result.success).toBe(true);
    expect(isOwner.value).toBe(true);
    expect(canAccessBranch('hq')).toBe(true);
    expect(canAccessBranch('dist1')).toBe(true);
    expect(canAccessBranch('any_branch')).toBe(true);
  });

  it('rejects invalid PIN', async () => {
    const result = await login(cashier, '0000', 'hq', 'test-secret');
    expect(result.success).toBe(false);
    expect(currentUser.value).toBeNull();
  });

  it('clears session on logout', async () => {
    await login(cashier, '1234', 'hq', 'test-secret');
    expect(currentUser.value).not.toBeNull();
    logout();
    expect(currentUser.value).toBeNull();
    expect(sessionToken.value).toBeNull();
  });
});
