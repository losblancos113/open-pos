import { describe, it, expect } from 'vitest';
import { createInitialOrderState, applyOrderEvent } from '../reducer';
import type { SessionDoc, BillDoc } from '../types';
import type { OrderEventDoc } from '../events';
import { money } from '../../money';

describe('M4 reducer event handlers', () => {
  const session: SessionDoc = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'],
    guestCount: 2,
    status: 'open',
    openedAt: '2026-10-24T10:00:00.000Z',
    openedBy: 'c1',
    billIds: ['bill:hq:b1'],
  };

  const bill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261024-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines: [
      {
        lineId: 'l1', productId: 'p1', nameSnapshot: { vi: 'A', en: 'A' },
        unitPriceSnapshot: money(65000, 'VND'), qty: 1, modifiers: [],
        status: 'placed', addedAt: '2026-10-24T10:00:00.000Z',
      },
      {
        lineId: 'l2', productId: 'p2', nameSnapshot: { vi: 'B', en: 'B' },
        unitPriceSnapshot: money(65000, 'VND'), qty: 1, modifiers: [],
        status: 'placed', addedAt: '2026-10-24T10:00:00.000Z',
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(130000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(130000, 'VND'),
    payments: [],
    balanceRemaining: money(130000, 'VND'),
    createdAt: '2026-10-24T10:00:00.000Z',
    updatedAt: '2026-10-24T10:00:00.000Z',
  };

  it('BILL_SPLIT voids selected lines in the bill', () => {
    const state = createInitialOrderState(session, bill);
    const event: OrderEventDoc = {
      eventId: 'ev-split',
      type: 'BILL_SPLIT',
      sessionId: 'session:hq:s1',
      billId: 'bill:hq:b1',
      actorId: 'c1',
      deviceId: 'T01',
      payload: { movedLineIds: ['l1'] },
      createdAt: '2026-10-24T10:05:00.000Z',
      schemaVersion: 1,
    };
    const next = applyOrderEvent(state, event);
    const l1 = next.bill.lines.find((l) => l.lineId === 'l1');
    const l2 = next.bill.lines.find((l) => l.lineId === 'l2');
    expect(l1?.status).toBe('voided');
    expect(l1?.voidReason).toBe('split');
    expect(l2?.status).toBe('placed');
    expect(next.bill.total.minor).toBe(65000);
  });

  it('BILL_MERGED marks the bill as voided', () => {
    const state = createInitialOrderState(session, bill);
    const event: OrderEventDoc = {
      eventId: 'ev-merge',
      type: 'BILL_MERGED',
      sessionId: 'session:hq:s1',
      billId: 'bill:hq:b1',
      actorId: 'c1',
      deviceId: 'T01',
      payload: { sourceBillIds: ['bill:hq:b1'], targetBillId: 'bill:hq:b2' },
      createdAt: '2026-10-24T10:05:00.000Z',
      schemaVersion: 1,
    };
    const next = applyOrderEvent(state, event);
    expect(next.bill.status).toBe('voided');
  });

  it('TABLE_TRANSFERRED updates session tableIds', () => {
    const state = createInitialOrderState(session, bill);
    const event: OrderEventDoc = {
      eventId: 'ev-transfer',
      type: 'TABLE_TRANSFERRED',
      sessionId: 'session:hq:s1',
      billId: '',
      actorId: 'c1',
      deviceId: 'T01',
      payload: { fromTableId: 'table:hq:t1', toTableId: 'table:hq:t2' },
      createdAt: '2026-10-24T10:05:00.000Z',
      schemaVersion: 1,
    };
    const next = applyOrderEvent(state, event);
    expect(next.session.tableIds).not.toContain('table:hq:t1');
    expect(next.session.tableIds).toContain('table:hq:t2');
  });
});
