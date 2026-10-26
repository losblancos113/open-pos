import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createShiftRepository } from '@/core/shift/shift-repository';
import { money } from '@/core/money';
import { useShift } from '../useShift';

describe('useShift composable', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let repo: ReturnType<typeof createShiftRepository>;
  const activeBranchId = ref('hq');
  const activeDeviceId = ref('term_01');

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createShiftRepository(adapter);
  });

  it('starts with no active shift, opens a shift, records cash drop, and closes the shift', async () => {
    const shiftComposable = useShift(repo, activeBranchId, activeDeviceId);
    await shiftComposable.refresh();

    expect(shiftComposable.activeShift.value).toBeNull();
    expect(shiftComposable.isOpen.value).toBe(false);

    // Open a shift
    const opened = await shiftComposable.openShift({
      userId: 'u1',
      userName: 'Alice',
      openingCash: money(500000, 'VND'),
      notes: 'Morning shift',
    });

    expect(opened.status).toBe('open');
    expect(shiftComposable.activeShift.value?.shiftId).toBe(opened.shiftId);
    expect(shiftComposable.isOpen.value).toBe(true);

    // Record cash drop
    await shiftComposable.recordCashMovement(
      'cash_drop',
      money(200000, 'VND'),
      'Safe transfer',
      'u1',
    );

    expect(shiftComposable.cashMovements.value).toHaveLength(1);
    expect(shiftComposable.cashMovements.value[0]?.amount.minor).toBe(200000);

    // Close the shift
    const closed = await shiftComposable.closeShift(money(300000, 'VND'), 'u1');
    expect(closed.status).toBe('closed');
    expect(shiftComposable.activeShift.value).toBeNull();
    expect(shiftComposable.isOpen.value).toBe(false);
  });
});
