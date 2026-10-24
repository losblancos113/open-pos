import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { money } from '../../money';
import { splitByItems, splitEvenly, splitBySeat, mergeBills, moveLines } from '../split-merge';
import { allocateEqual } from '../../money-allocate';
import type { BillDoc } from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeBill(
  totalMinor: number,
  lineSpecs: Array<{ lineId: string; qty: number; priceMinor: number; seat?: number }>
): BillDoc {
  const lines = lineSpecs.map((s) => ({
    lineId: s.lineId,
    productId: `product:${s.lineId}`,
    nameSnapshot: { vi: s.lineId, en: s.lineId },
    unitPriceSnapshot: money(s.priceMinor, 'VND'),
    qty: s.qty,
    modifiers: [],
    status: 'placed' as const,
    addedAt: '2026-10-24T10:00:00.000Z',
    ...(s.seat !== undefined ? { seat: s.seat } : {}),
  }));
  // totalMinor must match actual line subtotal for invariants to hold
  const actualSubtotal = lineSpecs.reduce((acc, s) => acc + s.priceMinor * s.qty, 0);
  return {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261024-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft' as const,
    lines,
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive' as const,
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(actualSubtotal, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(actualSubtotal, 'VND'),
    payments: [],
    balanceRemaining: money(actualSubtotal, 'VND'),
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z',
  };
}

// ─── TC1: splitByItems preserves total money ────────────────────────────────

describe('TC1: splitByItems preserves total money', () => {
  it('property: source.total + target.total == original.total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 3 }),
            priceMinor: fc.integer({ min: 1000, max: 500000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (lineSpecs) => {
          const bill = makeBill(0, lineSpecs);
          const originalTotal = bill.total.minor;
          const allIds = lineSpecs.map((s) => s.lineId);
          // Pick a non-empty proper subset (first half)
          const subset = allIds.slice(0, Math.ceil(allIds.length / 2));
          if (subset.length === 0 || subset.length === allIds.length) return;
          const result = splitByItems(bill, subset, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          const sum = result.sourceBill.total.minor + result.targetBill.total.minor;
          expect(sum).toBe(originalTotal);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── TC2: splitByItems never loses or duplicates lines ──────────────────────

describe('TC2: splitByItems preserves line count', () => {
  it('property: placed lines across both bills == original placed lines', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 3 }),
            priceMinor: fc.integer({ min: 1000, max: 500000 }),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        (lineSpecs) => {
          const bill = makeBill(
            lineSpecs.reduce((a, s) => a + s.priceMinor * s.qty, 0),
            lineSpecs
          );
          const allIds = lineSpecs.map((s) => s.lineId);
          const subset = allIds.slice(0, Math.ceil(allIds.length / 2));
          const result = splitByItems(bill, subset, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          const placedInSource = result.sourceBill.lines.filter((l) => l.status === 'placed').length;
          const placedInTarget = result.targetBill.lines.filter((l) => l.status === 'placed').length;
          expect(placedInSource + placedInTarget).toBe(allIds.length);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── TC3: splitEvenly preserves total money ──────────────────────────────────
// Note: splitEvenly returns { sourceBill, targetBills } where targetBills has
// N-1 entries. The total is conserved exactly because recalculateBillInPlace on
// targets is NOT called — each target's total is set directly to its allocation
// and never recomputed.

describe('TC3: splitEvenly target totals match allocations', () => {
  it('property: each target bill total equals its allocation; sum == original', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 5 }),
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 3 }),
            priceMinor: fc.integer({ min: 1000, max: 500000 }),
          }),
          { minLength: 1, maxLength: 3 }
        ),
        (parts, lineSpecs) => {
          const bill = makeBill(0, lineSpecs);
          const originalTotal = bill.total.minor;
          const result = splitEvenly(bill, parts, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          const allocations = allocateEqual(money(originalTotal, 'VND'), parts);
          // Each target bill's total is set directly to its allocation
          for (let i = 0; i < result.targetBills.length; i++) {
            expect(result.targetBills[i]!.total.minor).toBe(allocations[i + 1]!.minor);
          }
          // Sum of source + targets must equal original
          const sum =
            result.sourceBill.total.minor +
            result.targetBills.reduce((a, b) => a + b.total.minor, 0);
          expect(sum).toBe(originalTotal);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── TC4: splitBySeat preserves total money ─────────────────────────────────

describe('TC4: splitBySeat preserves total money', () => {
  it('property: source.total + sum(targetBills.total) == original.total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 3 }),
            priceMinor: fc.integer({ min: 1000, max: 500000 }),
            seat: fc.integer({ min: 1, max: 4 }),
          }),
          { minLength: 1, maxLength: 4 }
        ),
        (lineSpecs) => {
          const bill = makeBill(0, lineSpecs);
          const originalTotal = bill.total.minor;
          const result = splitBySeat(bill, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          const sum =
            result.sourceBill.total.minor +
            result.targetBills.reduce((a, b) => a + b.total.minor, 0);
          expect(sum).toBe(originalTotal);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── TC5: mergeBills preserves total money ──────────────────────────────────

describe('TC5: mergeBills preserves total money', () => {
  it('property: merged.total == sum of source totals', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 2 }),
            priceMinor: fc.integer({ min: 1000, max: 200000 }),
          }),
          { minLength: 1, maxLength: 2 }
        ),
        (lineSpecs1) => {
          const b1 = makeBill(0, lineSpecs1);
          const b2 = makeBill(0, [
            ...lineSpecs1.map((s) => ({ ...s, lineId: s.lineId + 'b' })),
          ]);
          b2._id = 'bill:hq:b2';
          b2.sessionId = 'session:hq:s1';
          const expectedTotal = b1.total.minor + b2.total.minor;
          const result = mergeBills([b1, b2], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          expect(result.mergedBill.total.minor).toBe(expectedTotal);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── TC7: moveLines preserves total money ───────────────────────────────────

describe('TC7: moveLines preserves total money', () => {
  it('property: source.total + target.total == original.total', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            lineId: fc.string({ minLength: 1, maxLength: 4 }),
            qty: fc.integer({ min: 1, max: 2 }),
            priceMinor: fc.integer({ min: 1000, max: 200000 }),
          }),
          { minLength: 2, maxLength: 4 }
        ),
        (lineSpecs) => {
          const bill = makeBill(0, lineSpecs);
          const originalTotal = bill.total.minor;
          // Target must be an empty bill (not cloned from source)
          const target: BillDoc = {
            _id: 'bill:hq:b2',
            branchId: 'hq',
            sessionId: 'session:hq:s1',
            billNumber: 'HQ-T01-20261024-0002',
            paymentRef: 'POSHQT010002',
            status: 'draft' as const,
            lines: [],
            discounts: [],
            surcharges: [],
            taxMode: 'inclusive' as const,
            taxLines: [],
            taxTotal: money(0, 'VND'),
            subtotal: money(0, 'VND'),
            discountTotal: money(0, 'VND'),
            surchargeTotal: money(0, 'VND'),
            total: money(0, 'VND'),
            payments: [],
            balanceRemaining: money(0, 'VND'),
            createdAt: '2026-10-24T10:00:00.000Z',
            updatedAt: '2026-10-24T10:00:00.000Z',
          };
          // Move a non-empty proper subset
          const allIds = lineSpecs.map((s) => s.lineId);
          const subset = allIds.filter((_, i) => i < allIds.length / 2);
          if (subset.length === 0) return;
          const result = moveLines(bill, subset, target, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
          const sum = result.sourceBill.total.minor + result.targetBill.total.minor;
          expect(sum).toBe(originalTotal);
        }
      ),
      { numRuns: 30 }
    );
  });
});
