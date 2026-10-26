import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createShiftRepository } from '../shift-repository';
import { money } from '../../money';
import type { BillDoc } from '../../order/types';

describe('Shift Repository', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let repo: ReturnType<typeof createShiftRepository>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createShiftRepository(adapter);
  });

  it('opens a shift, guards against overlapping active shifts on same device, and records cash movements', async () => {
    const shift = await repo.openShift({
      branchId: 'hq',
      deviceId: 'term_01',
      userId: 'usr_01',
      userName: 'Cashier Alice',
      openingCash: money(500000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
    });

    expect(shift.status).toBe('open');
    expect(shift.branchId).toBe('hq');

    // Active shift query
    const active = await repo.getActiveShift('hq', 'term_01');
    expect(active?.shiftId).toBe(shift.shiftId);

    // Another device can open a shift
    const device2Shift = await repo.openShift({
      branchId: 'hq',
      deviceId: 'term_02',
      userId: 'usr_02',
      userName: 'Bob',
      openingCash: money(300000, 'VND'),
    });
    expect(device2Shift.deviceId).toBe('term_02');

    // Duplicate active shift on term_01 should throw
    await expect(
      repo.openShift({
        branchId: 'hq',
        deviceId: 'term_01',
        userId: 'usr_03',
        userName: 'Charlie',
        openingCash: money(500000, 'VND'),
      })
    ).rejects.toThrow('An active shift is already open on this device');

    // Record cash drop
    await repo.recordCashMovement({
      branchId: 'hq',
      shiftId: shift.shiftId,
      type: 'cash_drop',
      amount: money(200000, 'VND'),
      reason: 'Gửi bớt tiền mặt vào két sắt',
      actorId: 'usr_01',
    });

    const movements = await repo.getCashMovements('hq', shift.shiftId);
    expect(movements).toHaveLength(1);
    expect(movements[0]?.type).toBe('cash_drop');
    expect(movements[0]?.amount.minor).toBe(200000);
  });

  it('closes a shift, aggregates settled cash bills within shift window, and calculates variance', async () => {
    const shift = await repo.openShift({
      branchId: 'hq',
      deviceId: 'term_01',
      userId: 'usr_01',
      userName: 'Cashier Alice',
      openingCash: money(500000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
    });

    // Seed a cash payment bill during the shift
    const paidBill: BillDoc = {
      _id: 'bill:hq:b01',
      branchId: 'hq',
      sessionId: 's01',
      billNumber: 'B-01',
      paymentRef: 'P-01',
      status: 'paid',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(150000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(150000, 'VND'),
      payments: [
        {
          paymentId: 'p1',
          method: 'cash',
          amount: money(150000, 'VND'),
          tendered: money(200000, 'VND'),
          change: money(50000, 'VND'),
          createdAt: '2026-10-26T09:30:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T09:00:00.000Z',
      updatedAt: '2026-10-26T09:30:00.000Z',
    };
    await adapter.put(paidBill as unknown as any);

    // Record cash in movement
    await repo.recordCashMovement({
      branchId: 'hq',
      shiftId: shift.shiftId,
      type: 'cash_in',
      amount: money(50000, 'VND'),
      reason: 'Bổ sung tiền lẻ',
      actorId: 'usr_01',
    });

    // Expected cash: opening (500k) + cash sales (150k) + cash in (50k) = 700k
    // Counted cash: 690k (shortage of 10k)
    const closed = await repo.closeShift({
      branchId: 'hq',
      shiftId: shift.shiftId,
      countedCash: money(690000, 'VND'),
      closedBy: 'usr_01',
      closedAt: '2026-10-26T17:00:00.000Z',
    });

    expect(closed.status).toBe('closed');
    expect(closed.closingCash?.minor).toBe(700000);
    expect(closed.countedCash?.minor).toBe(690000);
    expect(closed.variance?.minor).toBe(-10000);
    expect(closed.closedAt).toBe('2026-10-26T17:00:00.000Z');

    // No longer active
    const active = await repo.getActiveShift('hq', 'term_01');
    expect(active).toBeNull();

    // Idempotent re-close
    const reclosed = await repo.closeShift({
      branchId: 'hq',
      shiftId: shift.shiftId,
      countedCash: money(690000, 'VND'),
      closedBy: 'usr_01',
    });
    expect(reclosed.status).toBe('closed');
    expect(reclosed.variance?.minor).toBe(-10000);
  });
});
