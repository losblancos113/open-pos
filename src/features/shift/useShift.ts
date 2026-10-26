import { computed, ref, toValue, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';
import type { ShiftRepository } from '@/core/shift/shift-repository';
import type {
  ShiftCashMovementDoc,
  ShiftCashMovementType,
  ShiftDoc,
} from '@/core/shift/types';
import type { Money } from '@/core/money';

export interface UseShiftResult {
  activeShift: Ref<ShiftDoc | null>;
  isOpen: ComputedRef<boolean>;
  cashMovements: Ref<ShiftCashMovementDoc[]>;
  shifts: Ref<ShiftDoc[]>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  refresh: () => Promise<void>;
  openShift: (input: {
    userId: string;
    userName: string;
    openingCash: Money;
    notes?: string;
  }) => Promise<ShiftDoc>;
  recordCashMovement: (
    type: ShiftCashMovementType,
    amount: Money,
    reason: string,
    actorId: string,
  ) => Promise<ShiftCashMovementDoc>;
  closeShift: (countedCash: Money, closedBy: string, notes?: string) => Promise<ShiftDoc>;
}

export function useShift(
  repo: ShiftRepository,
  branchId: MaybeRefOrGetter<string>,
  deviceId: MaybeRefOrGetter<string>,
): UseShiftResult {
  const activeShift = ref<ShiftDoc | null>(null);
  const cashMovements = ref<ShiftCashMovementDoc[]>([]);
  const shifts = ref<ShiftDoc[]>([]);
  const isLoading = ref<boolean>(false);
  const error = ref<string | null>(null);

  const isOpen = computed(() => activeShift.value !== null && activeShift.value.status === 'open');

  async function refresh(): Promise<void> {
    const curBranch = toValue(branchId);
    const curDevice = toValue(deviceId);
    isLoading.value = true;
    error.value = null;

    try {
      const [current, allShifts] = await Promise.all([
        repo.getActiveShift(curBranch, curDevice),
        repo.getShifts(curBranch),
      ]);

      activeShift.value = current;
      shifts.value = allShifts;

      if (current) {
        cashMovements.value = await repo.getCashMovements(curBranch, current.shiftId);
      } else {
        cashMovements.value = [];
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      isLoading.value = false;
    }
  }

  async function openShift(input: {
    userId: string;
    userName: string;
    openingCash: Money;
    notes?: string;
  }): Promise<ShiftDoc> {
    const curBranch = toValue(branchId);
    const curDevice = toValue(deviceId);

    const doc = await repo.openShift({
      branchId: curBranch,
      deviceId: curDevice,
      userId: input.userId,
      userName: input.userName,
      openingCash: input.openingCash,
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
    });

    await refresh();
    return doc;
  }

  async function recordCashMovement(
    type: ShiftCashMovementType,
    amount: Money,
    reason: string,
    actorId: string,
  ): Promise<ShiftCashMovementDoc> {
    const curBranch = toValue(branchId);
    if (!activeShift.value) {
      throw new Error('Cannot record cash movement without an active shift');
    }

    const doc = await repo.recordCashMovement({
      branchId: curBranch,
      shiftId: activeShift.value.shiftId,
      type,
      amount,
      reason,
      actorId,
    });

    await refresh();
    return doc;
  }

  async function closeShift(
    countedCash: Money,
    closedBy: string,
    notes?: string,
  ): Promise<ShiftDoc> {
    const curBranch = toValue(branchId);
    if (!activeShift.value) {
      throw new Error('No active shift to close');
    }

    const doc = await repo.closeShift({
      branchId: curBranch,
      shiftId: activeShift.value.shiftId,
      countedCash,
      closedBy,
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
    });

    await refresh();
    return doc;
  }

  return {
    activeShift,
    isOpen,
    cashMovements,
    shifts,
    isLoading,
    error,
    refresh,
    openShift,
    recordCashMovement,
    closeShift,
  };
}
