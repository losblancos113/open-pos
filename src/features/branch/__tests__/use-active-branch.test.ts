// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createBranchRepository } from '@/core/branch/branch-repository';
import { useActiveBranch } from '../use-active-branch';
import { useCurrentUser } from '@/features/auth/use-current-user';
import { hashPin } from '@/core/auth/token';
import { GLOBAL_BRANCH_ID } from '@/core/db/branch';

describe('useActiveBranch', () => {
  beforeEach(() => {
    localStorage.clear();
    const { logout } = useCurrentUser();
    logout();
  });

  it('defaults to hq branch if no preference stored', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { activeBranchId, currentBranch, init } = useActiveBranch(repo);
    await init();

    expect(activeBranchId.value).toBe('hq');
    expect(currentBranch.value?.code).toBe('HQ');
  });

  it('switches branch successfully when user has authorization', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { login } = useCurrentUser();
    await login(
      {
        _id: 'user:admin',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'admin',
        displayName: 'Owner',
        pinHash: hashPin('8888'),
        role: 'owner',
        branchIds: ['hq', 'dist1'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      '8888',
      'hq',
      'secret',
    );

    const { activeBranchId, currentBranch, switchBranch, init } = useActiveBranch(repo);
    await init();

    await switchBranch('dist1');
    expect(activeBranchId.value).toBe('dist1');
    expect(currentBranch.value?.code).toBe('DIST1');
    expect(localStorage.getItem('openpos_active_branch')).toBe('dist1');
  });

  it('Review Focus 4: prevents switching to branch user is not authorized for', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createBranchRepository(adapter);
    await repo.seedDefaultBranches();

    const { login } = useCurrentUser();
    await login(
      {
        _id: 'user:cashier',
        docType: 'user',
        branchId: GLOBAL_BRANCH_ID,
        username: 'cashier',
        displayName: 'Cashier',
        pinHash: hashPin('1111'),
        role: 'cashier',
        branchIds: ['hq'],
        isActive: true,
        schemaVersion: 1,
        createdAt: '',
        updatedAt: '',
      },
      '1111',
      'hq',
      'secret',
    );

    const { switchBranch, init } = useActiveBranch(repo);
    await init();

    await expect(switchBranch('dist1')).rejects.toThrow('User is not authorized for branch "dist1"');
  });
});
