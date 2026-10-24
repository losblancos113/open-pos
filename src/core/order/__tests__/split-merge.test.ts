import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import type { BillDoc, SessionDoc } from '../types';
import {
  splitByItems,
  splitEvenly,
  splitBySeat,
  mergeBills,
  transferTable,
  moveLines,
} from '../split-merge';

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
  const subtotalMinor = lineSpecs.reduce((acc, s) => acc + s.priceMinor * s.qty, 0);
  return {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261024-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines,
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(subtotalMinor, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(totalMinor, 'VND'),
    payments: [],
    balanceRemaining: money(totalMinor, 'VND'),
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z',
  };
}

describe('splitByItems', () => {
  it('creates a target bill with selected lines and voids them in source', () => {
    const bill = makeBill(130000, [
      { lineId: 'l1', qty: 1, priceMinor: 65000 },
      { lineId: 'l2', qty: 1, priceMinor: 65000 },
    ]);
    const result = splitByItems(bill, ['l1'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');

    // debug: console.log('SRC lines:', result.sourceBill.lines.map(l => ({ id: l.lineId, status: l.status, voidReason: l.voidReason })));
    // debug: console.log('TGT lines:', result.targetBill.lines.map(l => ({ id: l.lineId, status: l.status })));
    // debug: console.log('SRC total:', result.sourceBill.total.minor, 'TGT total:', result.targetBill.total.minor);

    expect(result.sourceBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('voided');
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l1')?.voidReason).toBe('split');
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l2')?.status).toBe('placed');
    expect(result.targetBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('placed');
    expect(result.targetBill.total.minor).toBe(65000);
    expect(result.sourceBill.total.minor).toBe(65000);
  });

  it('preserves total money: source + target = original', () => {
    const bill = makeBill(130000, [
      { lineId: 'l1', qty: 1, priceMinor: 65000 },
      { lineId: 'l2', qty: 1, priceMinor: 65000 },
    ]);
    const result = splitByItems(bill, ['l1'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.sourceBill.total.minor + result.targetBill.total.minor).toBe(130000);
  });

  it('throws when lineId does not exist in the bill', () => {
    const bill = makeBill(65000, [{ lineId: 'l1', qty: 1, priceMinor: 65000 }]);
    expect(() =>
      splitByItems(bill, ['nonexistent'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z')
    ).toThrow();
  });

  it('splits all lines: source becomes empty, target gets everything', () => {
    const bill = makeBill(100000, [
      { lineId: 'l1', qty: 1, priceMinor: 100000 },
    ]);
    const result = splitByItems(bill, ['l1'], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.sourceBill.lines.every((l) => l.status === 'voided')).toBe(true);
    expect(result.targetBill.total.minor).toBe(100000);
    expect(result.sourceBill.total.minor).toBe(0);
  });
});

describe('splitEvenly', () => {
  it('splits 100000 into 3 equal parts: 34000+33000+33000=100000', () => {
    const bill = makeBill(100000, [
      { lineId: 'l1', qty: 1, priceMinor: 100000 },
    ]);
    const result = splitEvenly(bill, 3, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    const sum = result.sourceBill.total.minor + result.targetBills.reduce((a, b) => a + b.total.minor, 0);
    expect(sum).toBe(100000);
    expect(result.targetBills).toHaveLength(2); // N-1 targets (source is separate)
  });

  it('returns unchanged when parts === 1', () => {
    const bill = makeBill(50000, [{ lineId: 'l1', qty: 1, priceMinor: 50000 }]);
    const result = splitEvenly(bill, 1, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.targetBills).toHaveLength(0);
    expect(result.sourceBill.total.minor).toBe(50000);
  });

  it('throws when parts < 1', () => {
    const bill = makeBill(100000, [{ lineId: 'l1', qty: 1, priceMinor: 100000 }]);
    expect(() => splitEvenly(bill, 0, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z'))
      .toThrow('parts must be >= 1');
  });
});

describe('splitBySeat', () => {
  it('groups lines by seat and creates one bill per seat', () => {
    const bill = makeBill(200000, [
      { lineId: 'l1', qty: 1, priceMinor: 100000, seat: 1 },
      { lineId: 'l2', qty: 1, priceMinor: 100000, seat: 2 },
    ]);
    const result = splitBySeat(bill, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');

    expect(result.targetBills).toHaveLength(2);
    expect(result.targetBills[0]!.lines.every((l) => l.seat === 1)).toBe(true);
    expect(result.targetBills[1]!.lines.every((l) => l.seat === 2)).toBe(true);

    const sum = result.sourceBill.total.minor + result.targetBills.reduce((a, b) => a + b.total.minor, 0);
    expect(sum).toBe(200000);
  });

  it('throws when no lines have a seat', () => {
    const bill = makeBill(100000, [{ lineId: 'l1', qty: 1, priceMinor: 100000 }]);
    expect(() => splitBySeat(bill, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z'))
      .toThrow('splitBySeat(): at least one line must have a seat number');
  });

  it('handles mixed seat/unseat lines: unseat goes to unassigned bill', () => {
    const bill = makeBill(150000, [
      { lineId: 'l1', qty: 1, priceMinor: 100000, seat: 1 },
      { lineId: 'l2', qty: 1, priceMinor: 50000 },
    ]);
    const result = splitBySeat(bill, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.targetBills).toHaveLength(2);
    expect(result.targetBills.some((b) => b.lines[0]?.seat === 1)).toBe(true);
    expect(result.targetBills.some((b) => b.lines[0]?.seat === undefined)).toBe(true);
    const sum = result.sourceBill.total.minor + result.targetBills.reduce((a, b) => a + b.total.minor, 0);
    expect(sum).toBe(150000);
  });
});

describe('mergeBills', () => {
  it('merges two bills: merged total equals sum of sources', () => {
    const b1 = makeBill(50000, [{ lineId: 'l1', qty: 1, priceMinor: 50000 }]);
    const b2 = makeBill(70000, [{ lineId: 'l2', qty: 1, priceMinor: 70000 }]);
    b2._id = 'bill:hq:b2';
    b2.sessionId = 'session:hq:s1';
    const result = mergeBills([b1, b2], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.mergedBill.total.minor).toBe(120000);
    expect(result.mergedBill.lines).toHaveLength(2);
  });

  it('throws when fewer than 2 source bills', () => {
    const b1 = makeBill(50000, [{ lineId: 'l1', qty: 1, priceMinor: 50000 }]);
    expect(() => mergeBills([b1], 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z'))
      .toThrow('need at least 2 source bills');
  });
});

describe('transferTable', () => {
  it('moves fromTableId and adds toTableId', () => {
    const session = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: '2026-10-24T10:00:00.000Z',
      openedBy: 'c1',
      billIds: [],
    } as import('../types').SessionDoc;
    const { session: next } = transferTable(
      session,
      'table:hq:t1',
      'table:hq:t2',
      'c1',
      'T01',
      undefined,
      '2026-10-24T10:05:00.000Z'
    );
    expect(next.tableIds).not.toContain('table:hq:t1');
    expect(next.tableIds).toContain('table:hq:t2');
    expect(next.tableIds).toHaveLength(1);
  });

  it('throws when fromTableId equals toTableId', () => {
    const session = {
      _id: 'session:hq:s1', branchId: 'hq', tableIds: ['table:hq:t1'],
      guestCount: 2, status: 'open', openedAt: '', openedBy: 'c1', billIds: [],
    } as import('../types').SessionDoc;
    expect(() => transferTable(session, 'table:hq:t1', 'table:hq:t1', 'c1', 'T01', undefined, ''))
      .toThrow('must differ');
  });
});

describe('moveLines', () => {
  it('moves selected lines from source to target and preserves totals', () => {
    const src = makeBill(130000, [
      { lineId: 'l1', qty: 1, priceMinor: 65000 },
      { lineId: 'l2', qty: 1, priceMinor: 65000 },
    ]);
    const tgt = makeBill(0, []);
    tgt._id = 'bill:hq:b2';
    tgt.sessionId = 'session:hq:s1';

    const result = moveLines(src, ['l1'], tgt, 'c1', 'T01', 'session:hq:s1', '2026-10-24T10:05:00.000Z');
    expect(result.sourceBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('voided');
    expect(result.targetBill.lines.find((l) => l.lineId === 'l1')?.status).toBe('placed');
    expect(result.sourceBill.total.minor + result.targetBill.total.minor).toBe(130000);
  });
});
