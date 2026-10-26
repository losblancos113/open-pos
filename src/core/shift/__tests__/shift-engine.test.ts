import { describe, it, expect } from 'vitest';
import { calculateShiftVariance, createShiftDoc, createCashMovementDoc } from '../shift-engine';
import { money } from '../../money';

describe('Shift Engine & Variance Calculation', () => {
  it('calculates expected cash and exact variance (surplus, shortage, and exact match)', () => {
    const opening = money(1000000, 'VND');
    const sales = money(3500000, 'VND');
    const refunds = money(200000, 'VND');
    const cashIn = money(500000, 'VND');
    const cashDrops = money(2000000, 'VND');
    // expected = 1,000,000 + 3,500,000 - 200,000 + 500,000 - 2,000,000 = 2,800,000

    // Exact match
    const exact = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2800000, 'VND'));
    expect(exact.expectedCash.minor).toBe(2800000);
    expect(exact.variance.minor).toBe(0);

    // Shortage of 50,000
    const shortage = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2750000, 'VND'));
    expect(shortage.variance.minor).toBe(-50000);

    // Surplus of 100,000
    const surplus = calculateShiftVariance(opening, sales, refunds, cashIn, cashDrops, money(2900000, 'VND'));
    expect(surplus.variance.minor).toBe(100000);
  });

  it('creates valid ShiftDoc with defaults and validation', () => {
    const shift = createShiftDoc({
      branchId: 'hq',
      deviceId: 'term_01',
      userId: 'usr_01',
      userName: 'Cashier Alice',
      openingCash: money(500000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
      notes: 'Morning shift',
    });

    expect(shift._id).toBe('shift:hq:' + shift.shiftId);
    expect(shift.status).toBe('open');
    expect(shift.branchId).toBe('hq');
    expect(shift.deviceId).toBe('term_01');
    expect(shift.openingCash.minor).toBe(500000);
    expect(shift.notes).toBe('Morning shift');
  });

  it('rejects invalid inputs when creating ShiftDoc', () => {
    expect(() =>
      createShiftDoc({
        branchId: '',
        deviceId: 'term_01',
        userId: 'u1',
        userName: 'Alice',
        openingCash: money(500000, 'VND'),
      })
    ).toThrow('branchId must be a non-empty string');

    expect(() =>
      createShiftDoc({
        branchId: 'hq',
        deviceId: '',
        userId: 'u1',
        userName: 'Alice',
        openingCash: money(500000, 'VND'),
      })
    ).toThrow('deviceId must be a non-empty string');
  });

  it('creates valid ShiftCashMovementDoc with type validation', () => {
    const mov = createCashMovementDoc({
      branchId: 'hq',
      shiftId: 'sh_01',
      type: 'cash_drop',
      amount: money(1000000, 'VND'),
      reason: 'Mid-day safe deposit',
      actorId: 'mgr_01',
      createdAt: '2026-10-26T12:00:00.000Z',
    });

    expect(mov._id).toBe('shift_cash:hq:' + mov.movementId);
    expect(mov.type).toBe('cash_drop');
    expect(mov.amount.minor).toBe(1000000);
    expect(mov.reason).toBe('Mid-day safe deposit');
  });

  it('rejects invalid cash movement types or negative amounts', () => {
    expect(() =>
      createCashMovementDoc({
        branchId: 'hq',
        shiftId: 'sh_01',
        type: 'invalid' as any,
        amount: money(10000, 'VND'),
        reason: 'Test',
        actorId: 'usr1',
      })
    ).toThrow('Invalid cash movement type');

    expect(() =>
      createCashMovementDoc({
        branchId: 'hq',
        shiftId: 'sh_01',
        type: 'cash_in',
        amount: money(-500, 'VND'),
        reason: 'Test',
        actorId: 'usr1',
      })
    ).toThrow('Cash movement amount must be positive');
  });
});
