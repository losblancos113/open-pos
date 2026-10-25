import { ref } from 'vue';
import type { BranchDoc } from '@/core/branch/types';
import type { BranchRepository } from '@/core/branch/branch-repository';
import { useCurrentUser } from '@/features/auth/use-current-user';

const STORAGE_KEY = 'openpos_active_branch';
const activeBranchId = ref<string>('hq');
const currentBranch = ref<BranchDoc | null>(null);
const availableBranches = ref<BranchDoc[]>([]);

export function useActiveBranch(repo?: BranchRepository) {
  const { canAccessBranch } = useCurrentUser();

  async function init() {
    if (!repo) return;
    const branches = await repo.listBranches();
    availableBranches.value = branches;

    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const targetId = saved ?? 'hq';

    const found = branches.find(
      (b) => b.code.toLowerCase() === targetId || b._id === `branch:${targetId}`,
    );

    if (found) {
      activeBranchId.value = found.code.toLowerCase();
      currentBranch.value = found;
    } else if (branches.length > 0) {
      activeBranchId.value = branches[0]!.code.toLowerCase();
      currentBranch.value = branches[0]!;
    }
  }

  async function switchBranch(targetId: string) {
    const normalized = targetId.toLowerCase();
    if (!canAccessBranch(normalized)) {
      throw new Error(`User is not authorized for branch "${targetId}"`);
    }

    if (repo) {
      const branches = await repo.listBranches();
      availableBranches.value = branches;
      const found = branches.find(
        (b) => b.code.toLowerCase() === normalized || b._id === `branch:${normalized}`,
      );
      if (found) {
        currentBranch.value = found;
      }
    }

    activeBranchId.value = normalized;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, normalized);
    }
  }

  return {
    activeBranchId,
    currentBranch,
    availableBranches,
    init,
    switchBranch,
  };
}
