import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { createInitialOrderState, applyOrderEvent, reduceOrderEvents } from '../reducer';
import type { OrderEventDoc } from '../events';
import type { SessionDoc, BillDoc } from '../types';

describe('Order event reducer', () => {
  const session: SessionDoc = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'],
    guestCount: 2,
    status: 'open',
    openedAt: '2026-10-23T10:00:00.000Z',
    openedBy: 'cashier-1',
    billIds: ['bill:hq:b1'],
  };

  const bill: BillDoc = {
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261023-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(0, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(0, 'VND'),
    payments: [],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T10:00:00.000Z',
  };

  it('applies LINE_ADDED and recalculates subtotal and total', () => {
    const initial = createInitialOrderState(session, bill);
    const event: OrderEventDoc = {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'product:pho-bo',
        nameSnapshot: { vi: 'Phở bò', en: 'Beef Noodle' },
        unitPriceSnapshot: money(65000, 'VND'),
        qty: 2,
        modifiers: [
          {
            groupId: 'grp-topping',
            groupNameSnapshot: 'Topping',
            optionId: 'opt-egg',
            optionNameSnapshot: 'Trứng',
            priceDelta: money(5000, 'VND'),
          },
        ],
        addedAt: '2026-10-23T10:01:00.000Z',
      },
      createdAt: '2026-10-23T10:01:00.000Z',
      schemaVersion: 1,
    };

    const next = applyOrderEvent(initial, event);
    expect(next.bill.lines).toHaveLength(1);
    // (65000 + 5000) * 2 = 140000 VND
    expect(next.bill.subtotal.minor).toBe(140000);
    expect(next.bill.total.minor).toBe(140000);
    expect(next.bill.balanceRemaining.minor).toBe(140000);
  });

  it('calculates inclusive VAT without changing total charged', () => {
    const initial = createInitialOrderState(session, {
      ...bill,
      taxLines: [{ rateId: 'vat10', label: { vi: 'VAT 10%', en: 'VAT 10%' }, rate: 10, base: money(0, 'VND'), amount: money(0, 'VND') }],
    });
    // Add line 110,000 VND
    const next = applyOrderEvent(initial, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(110000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });
    expect(next.bill.total.minor).toBe(110000);
    // 110000 - 110000/(1+0.10) = 10000 VND
    expect(next.bill.taxTotal.minor).toBe(10000);
    expect(next.bill.taxLines[0]?.amount.minor).toBe(10000);
    expect(next.bill.taxLines[0]?.base.minor).toBe(110000);
  });

  it('calculates exclusive VAT adding tax to total', () => {
    const initial = createInitialOrderState(session, {
      ...bill,
      taxMode: 'exclusive',
      taxLines: [{ rateId: 'vat10', label: { vi: 'VAT 10%', en: 'VAT 10%' }, rate: 10, base: money(0, 'VND'), amount: money(0, 'VND') }],
    });
    const next = applyOrderEvent(initial, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });
    expect(next.bill.subtotal.minor).toBe(100000);
    expect(next.bill.taxTotal.minor).toBe(10000);
    expect(next.bill.total.minor).toBe(110000);
    expect(next.bill.balanceRemaining.minor).toBe(110000);
  });

  it('preserves integer minor units across multiple tax lines via largest-remainder allocation', () => {
    const initial = createInitialOrderState(session, {
      ...bill,
      taxLines: [
        { rateId: 'vat8', label: { vi: 'VAT 8%', en: 'VAT 8%' }, rate: 8, base: money(0, 'VND'), amount: money(0, 'VND') },
        { rateId: 'vat10', label: { vi: 'VAT 10%', en: 'VAT 10%' }, rate: 10, base: money(0, 'VND'), amount: money(0, 'VND') },
      ],
    });
    const next = applyOrderEvent(initial, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    const sumTaxLines = next.bill.taxLines.reduce((acc, t) => acc + t.amount.minor, 0);
    expect(sumTaxLines).toBe(next.bill.taxTotal.minor);
    expect(next.bill.total.minor).toBe(100000);
  });

  it('tracks split payments and remaining balance accurately', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    // Pay 40,000 cash
    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'PAYMENT_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        paymentId: 'pay-1',
        method: 'cash',
        amount: money(40000, 'VND'),
        tendered: money(50000, 'VND'),
        change: money(10000, 'VND'),
        createdAt: '2026-10-23T10:05:00Z',
      },
      createdAt: '2026-10-23T10:05:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.balanceRemaining.minor).toBe(60000);
    expect(state.bill.status).toBe('placed');

    // Pay 60,000 VietQR
    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'PAYMENT_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        paymentId: 'pay-2',
        method: 'bank_transfer',
        amount: money(60000, 'VND'),
        ref: 'POSHQT010001',
        createdAt: '2026-10-23T10:06:00Z',
      },
      createdAt: '2026-10-23T10:06:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.balanceRemaining.minor).toBe(0);
    expect(state.bill.status).toBe('paid');
  });

  it('applies percentage and fixed discounts and caps at subtotal', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(200000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    // 10% discount -> 20,000 VND
    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        type: 'percent',
        value: 10,
        reason: 'VIP',
      },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.discountTotal.minor).toBe(20000);
    expect(state.bill.total.minor).toBe(180000);

    // Fixed discount 30,000 VND -> total discount = 50,000 VND
    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        type: 'fixed',
        value: 30000,
        reason: 'Voucher',
      },
      createdAt: '2026-10-23T10:02:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.discountTotal.minor).toBe(50000);
    expect(state.bill.total.minor).toBe(150000);

    // Excessive fixed discount capped at subtotal
    state = applyOrderEvent(state, {
      eventId: 'ev-4',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        type: 'fixed',
        value: 500000,
        reason: 'Staff error',
      },
      createdAt: '2026-10-23T10:03:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.discountTotal.minor).toBe(200000);
    expect(state.bill.total.minor).toBe(0);
  });

  it('applies percentage and fixed surcharges on net amount (subtotal - discount)', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    // 5% service charge on 100,000 = 5,000 VND
    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'SURCHARGE_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        type: 'service_charge',
        name: 'Service Charge 5%',
        ratePercent: 5,
      },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.surchargeTotal.minor).toBe(5000);
    expect(state.bill.total.minor).toBe(105000);

    // Fixed surcharge 10,000 VND
    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'SURCHARGE_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        type: 'custom',
        name: 'Holiday surcharge',
        fixedAmount: money(10000, 'VND'),
      },
      createdAt: '2026-10-23T10:02:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.surchargeTotal.minor).toBe(15000);
    expect(state.bill.total.minor).toBe(115000);
  });

  it('handles combo selections and comboPriceDelta on lines', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-combo',
        productId: 'combo:lunch',
        nameSnapshot: { vi: 'Combo Trưa', en: 'Lunch Combo' },
        unitPriceSnapshot: money(89000, 'VND'),
        comboSelections: [
          { groupKey: 'drink', optionIds: ['p-coke'] },
        ],
        comboPriceDelta: money(5000, 'VND'),
        qty: 2,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });
    // (89000 + 5000) * 2 = 188,000 VND
    expect(state.bill.subtotal.minor).toBe(188000);
    expect(state.bill.total.minor).toBe(188000);
  });

  it('handles LINE_QTY_CHANGED and recalculates totals', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.subtotal.minor).toBe(50000);

    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'LINE_QTY_CHANGED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        qty: 3,
      },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.lines[0]?.qty).toBe(3);
    expect(state.bill.subtotal.minor).toBe(150000);
    expect(state.bill.total.minor).toBe(150000);
  });

  it('handles LINE_NOTE_CHANGED', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 1,
        modifiers: [],
        note: 'Ít đường',
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'LINE_NOTE_CHANGED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        note: 'Không đường, nhiều đá',
      },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.lines[0]?.note).toBe('Không đường, nhiều đá');
  });

  it('handles LINE_VOIDED and excludes voided lines from subtotal', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món 1', en: 'Item 1' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 2,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });
    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-2',
        productId: 'p2',
        nameSnapshot: { vi: 'Món 2', en: 'Item 2' },
        unitPriceSnapshot: money(30000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:01:00Z',
      },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.subtotal.minor).toBe(130000);

    // Void line 1
    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'LINE_VOIDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        reason: 'Khách đổi món',
      },
      createdAt: '2026-10-23T10:02:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.lines[0]?.status).toBe('voided');
    expect(state.bill.lines[0]?.voidReason).toBe('Khách đổi món');
    expect(state.bill.subtotal.minor).toBe(30000);
    expect(state.bill.total.minor).toBe(30000);
  });

  it('handles DISCOUNT_REMOVED and SURCHARGE_REMOVED', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: { type: 'percent', value: 10, reason: 'VIP' },
      createdAt: '2026-10-23T10:01:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.discountTotal.minor).toBe(10000);

    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'DISCOUNT_REMOVED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: { reason: 'VIP' },
      createdAt: '2026-10-23T10:02:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.discountTotal.minor).toBe(0);

    state = applyOrderEvent(state, {
      eventId: 'ev-4',
      type: 'SURCHARGE_APPLIED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: { type: 'custom', name: 'Service', fixedAmount: money(5000, 'VND') },
      createdAt: '2026-10-23T10:03:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.surchargeTotal.minor).toBe(5000);

    state = applyOrderEvent(state, {
      eventId: 'ev-5',
      type: 'SURCHARGE_REMOVED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: { name: 'Service' },
      createdAt: '2026-10-23T10:04:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.surchargeTotal.minor).toBe(0);
  });

  it('handles PAYMENT_VOIDED and restores placed status and balance', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(100000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    });

    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'PAYMENT_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        paymentId: 'pay-1',
        method: 'cash',
        amount: money(100000, 'VND'),
        createdAt: '2026-10-23T10:05:00Z',
      },
      createdAt: '2026-10-23T10:05:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.status).toBe('paid');
    expect(state.bill.balanceRemaining.minor).toBe(0);

    // Void the payment
    state = applyOrderEvent(state, {
      eventId: 'ev-3',
      type: 'PAYMENT_VOIDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        paymentId: 'pay-1',
        reason: 'Khách chọn thẻ',
      },
      createdAt: '2026-10-23T10:06:00Z',
      schemaVersion: 1,
    });
    expect(state.bill.status).toBe('placed');
    expect(state.bill.balanceRemaining.minor).toBe(100000);
    expect(state.bill.payments).toHaveLength(0);
  });

  it('handles BILL_PRINTED and sets printedAt and tableStatus', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'BILL_PRINTED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        printedAt: '2026-10-23T10:15:00.000Z',
      },
      createdAt: '2026-10-23T10:15:00.000Z',
      schemaVersion: 1,
    });
    expect(state.bill.printedAt).toBe('2026-10-23T10:15:00.000Z');
    expect(state.tableStatus).toBe('bill_printed');
  });

  it('handles BILL_VOIDED and BILL_CLOSED', () => {
    let state = createInitialOrderState(session, bill);
    state = applyOrderEvent(state, {
      eventId: 'ev-1',
      type: 'BILL_VOIDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: { reason: 'Khách huỷ' },
      createdAt: '2026-10-23T10:20:00.000Z',
      schemaVersion: 1,
    });
    expect(state.bill.status).toBe('voided');

    state = applyOrderEvent(state, {
      eventId: 'ev-2',
      type: 'BILL_CLOSED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {},
      createdAt: '2026-10-23T10:25:00.000Z',
      schemaVersion: 1,
    });
    expect(state.session.status).toBe('closed');
    expect(state.session.closedAt).toBe('2026-10-23T10:25:00.000Z');
    expect(state.tableStatus).toBe('empty');
  });

  it('handles reduceOrderEvents replaying an event sequence deterministically', () => {
    const initial = createInitialOrderState(session, bill);
    const events: OrderEventDoc[] = [
      {
        eventId: 'ev-1',
        type: 'LINE_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: {
          lineId: 'l-1',
          productId: 'p1',
          nameSnapshot: { vi: 'Phở', en: 'Pho' },
          unitPriceSnapshot: money(60000, 'VND'),
          qty: 2,
          modifiers: [],
          addedAt: '2026-10-23T10:00:00Z',
        },
        createdAt: '2026-10-23T10:00:00Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev-2',
        type: 'ORDER_PLACED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: {},
        createdAt: '2026-10-23T10:01:00Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev-3',
        type: 'PAYMENT_ADDED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: {
          paymentId: 'pay-1',
          method: 'cash',
          amount: money(120000, 'VND'),
          tendered: money(150000, 'VND'),
          change: money(30000, 'VND'),
          createdAt: '2026-10-23T10:05:00Z',
        },
        createdAt: '2026-10-23T10:05:00Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev-4',
        type: 'BILL_CLOSED',
        sessionId: session._id,
        billId: bill._id,
        actorId: 'c1',
        deviceId: 'T01',
        payload: {},
        createdAt: '2026-10-23T10:06:00Z',
        schemaVersion: 1,
      },
    ];

    const result = reduceOrderEvents(initial, events);
    expect(result.bill.status).toBe('paid');
    expect(result.bill.subtotal.minor).toBe(120000);
    expect(result.bill.total.minor).toBe(120000);
    expect(result.bill.balanceRemaining.minor).toBe(0);
    expect(result.session.status).toBe('closed');
  });

  it('guarantees immutability on applyOrderEvent', () => {
    const initial = createInitialOrderState(session, bill);
    const event: OrderEventDoc = {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l-1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món', en: 'Item' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T10:00:00Z',
      },
      createdAt: '2026-10-23T10:00:00Z',
      schemaVersion: 1,
    };

    const next = applyOrderEvent(initial, event);
    expect(initial.bill.lines).toHaveLength(0);
    expect(next.bill.lines).toHaveLength(1);
    expect(initial.bill.subtotal.minor).toBe(0);
    expect(next.bill.subtotal.minor).toBe(50000);
  });
});
