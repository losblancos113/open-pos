import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { DbAdapter } from '../../db/adapter';
import { createBranchRepository, type BranchRepository } from '../branch-repository';

describe('BranchRepository', () => {
  let adapter: DbAdapter;
  let repo: BranchRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createBranchRepository(adapter);
  });

  it('creates and retrieves a new branch', async () => {
    const branch = await repo.createBranch({
      code: 'D1',
      name: 'Chi nhánh Quận 1',
      address: '123 Nguyễn Thị Minh Khai',
      phone: '02838221234',
    });

    expect(branch._id).toBe('branch:d1');
    expect(branch.code).toBe('D1');
    expect(branch.branchId).toBe('*'); // Global tier
    expect(branch.isActive).toBe(true);

    const fetched = await repo.getBranch('d1');
    expect(fetched).toEqual(branch);
  });

  it('rejects duplicate branch code', async () => {
    await repo.createBranch({ code: 'HQ', name: 'Trụ sở' });
    await expect(repo.createBranch({ code: 'HQ', name: 'Trùng lặp' }))
      .rejects.toThrow('Branch code "HQ" already exists');
  });

  it('updates an existing branch', async () => {
    await repo.createBranch({ code: 'D2', name: 'Chi nhánh Quận 2' });
    const updated = await repo.updateBranch('d2', {
      name: 'Chi nhánh Thảo Điền',
      address: 'Số 1 Xuân Thuỷ',
    });

    expect(updated.name).toBe('Chi nhánh Thảo Điền');
    expect(updated.address).toBe('Số 1 Xuân Thuỷ');
  });

  it('lists only active branches by default', async () => {
    await repo.createBranch({ code: 'B1', name: 'Active Branch' });
    const b2 = await repo.createBranch({ code: 'B2', name: 'Inactive Branch' });
    await repo.updateBranch('b2', { isActive: false });

    const activeList = await repo.listBranches();
    expect(activeList.map((b) => b.code)).toEqual(['B1']);

    const allList = await repo.listBranches({ includeInactive: true });
    expect(allList.map((b) => b.code).sort()).toEqual(['B1', 'B2']);
  });

  it('seeds default branches (hq and dist1) if database is empty', async () => {
    const seeded = await repo.seedDefaultBranches();
    expect(seeded.length).toBeGreaterThanOrEqual(1);
    expect(seeded.some((b) => b.code === 'HQ')).toBe(true);

    // Re-running seed does not duplicate
    const secondSeed = await repo.seedDefaultBranches();
    expect(secondSeed.length).toBe(seeded.length);
  });
});
