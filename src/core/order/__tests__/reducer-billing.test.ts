import { describe, it, expect } from 'vitest';
import { money } from '../../money';
import { createInitialOrderState, applyOrderEvent } from '../reducer';
import type { OrderEventDoc } from '../events';
import type { SessionDoc, BillDoc, TaxLine } from '../types';

describe('Order Reducer: Discounts, Surcharges, and VAT Tax', () => {
  const session: SessionDoc = {
    _id: 'session:hq:s1',
    branchId: 'hq',
    tableIds: ['table:hq:t1'],
    guestCount: 2,
    status: 'open',
    openedAt: '2026-10-29T10:00:00.000Z',
    openedBy: 'cashier-1',
    billIds: ['bill:hq:b1'],
  };

  const createBaseBill = (): BillDoc => ({
    _id: 'bill:hq:b1',
    branchId: 'hq',
    sessionId: 'session:hq:s1',
    billNumber: 'HQ-T01-20261029-0001',
    paymentRef: 'POSHQT010001',
    status: 'draft',
    lines: [
      {
        lineId: 'l-1',
        productId: 'product:coffee',
        nameSnapshot: { vi: 'Cà phê sữa', en: 'Milk Coffee' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 2, // Subtotal = 100,000 VND
        modifiers: [],
        status: 'placed',
        addedAt: '2026-10-29T10:00:00.000Z',
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(100000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(100000, 'VND'),
    payments: [],
    balanceRemaining: money(100000, 'VND'),
    createdAt: '2026-10-29T10:00:00.000Z',
    updatedAt: '2026-10-29T10:00:00.000Z',
  });

  it('calculates percentage discount accurately', () => {
    const state = createInitialOrderState(session, createBaseBill());

    const discEvent: OrderEventDoc = {
      eventId: 'ev-disc-1',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        type: 'percent',
        value: 10,
        reason: 'Khách VIP',
      },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    };

    const nextState = applyOrderEvent(state, discEvent);
    expect(nextState.bill.discountTotal.minor).toBe(10000);
    expect(nextState.bill.total.minor).toBe(90000);
    expect(nextState.bill.balanceRemaining.minor).toBe(90000);
  });

  it('calculates fixed cash discount and caps at subtotal', () => {
    const state = createInitialOrderState(session, createBaseBill());

    const discEvent: OrderEventDoc = {
      eventId: 'ev-disc-2',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        type: 'fixed',
        value: 150000, // exceeds subtotal of 100,000
        reason: 'Voucher lớn',
      },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    };

    const nextState = applyOrderEvent(state, discEvent);
    // Capped at subtotal
    expect(nextState.bill.discountTotal.minor).toBe(100000);
    expect(nextState.bill.total.minor).toBe(0);
  });

  it('applies and removes surcharges correctly', () => {
    const state = createInitialOrderState(session, createBaseBill());

    const surchargeEvent: OrderEventDoc = {
      eventId: 'ev-sur-1',
      type: 'SURCHARGE_APPLIED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        type: 'service_charge',
        name: 'Phí dịch vụ 5%',
        ratePercent: 5,
      },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    };

    const stateWithSurcharge = applyOrderEvent(state, surchargeEvent);
    expect(stateWithSurcharge.bill.surchargeTotal.minor).toBe(5000);
    expect(stateWithSurcharge.bill.total.minor).toBe(105000);

    // Now remove surcharge
    const removeEvent: OrderEventDoc = {
      eventId: 'ev-sur-2',
      type: 'SURCHARGE_REMOVED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: { index: 0 },
      createdAt: '2026-10-29T10:02:00.000Z',
      schemaVersion: 1,
    };

    const stateAfterRemoval = applyOrderEvent(stateWithSurcharge, removeEvent);
    expect(stateAfterRemoval.bill.surcharges).toHaveLength(0);
    expect(stateAfterRemoval.bill.surchargeTotal.minor).toBe(0);
    expect(stateAfterRemoval.bill.total.minor).toBe(100000);
  });

  it('handles TAX_UPDATED in inclusive mode without altering total', () => {
    const state = createInitialOrderState(session, createBaseBill());

    const vatLine: TaxLine = {
      rateId: 'tax_vat_10',
      label: { vi: 'Thuế GTGT', en: 'VAT' },
      rate: 10,
      base: money(0, 'VND'),
      amount: money(0, 'VND'),
    };

    const taxEvent: OrderEventDoc = {
      eventId: 'ev-tax-1',
      type: 'TAX_UPDATED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        taxMode: 'inclusive',
        taxLines: [vatLine],
      },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    };

    const nextState = applyOrderEvent(state, taxEvent);
    expect(nextState.bill.taxMode).toBe('inclusive');
    expect(nextState.bill.taxLines).toHaveLength(1);

    // Inclusive VAT formula: subtotal - round(subtotal * 100 / (100 + 10)) = 100,000 - 90,909 = 9,091
    expect(nextState.bill.taxTotal.minor).toBe(9091);
    expect(nextState.bill.taxLines[0]!.amount.minor).toBe(9091);
    // In inclusive mode, total must stay 100,000 VND
    expect(nextState.bill.total.minor).toBe(100000);
  });

  it('handles TAX_UPDATED in exclusive mode adding tax on top of total', () => {
    const state = createInitialOrderState(session, createBaseBill());

    const vatLine: TaxLine = {
      rateId: 'tax_vat_8',
      label: { vi: 'Thuế GTGT', en: 'VAT' },
      rate: 8,
      base: money(0, 'VND'),
      amount: money(0, 'VND'),
    };

    const taxEvent: OrderEventDoc = {
      eventId: 'ev-tax-2',
      type: 'TAX_UPDATED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        taxMode: 'exclusive',
        taxLines: [vatLine],
      },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    };

    const nextState = applyOrderEvent(state, taxEvent);
    expect(nextState.bill.taxMode).toBe('exclusive');

    // Exclusive VAT: 100,000 * 8% = 8,000 VND
    expect(nextState.bill.taxTotal.minor).toBe(8000);
    expect(nextState.bill.taxLines[0]!.amount.minor).toBe(8000);
    // Total is subtotal + tax = 108,000 VND
    expect(nextState.bill.total.minor).toBe(108000);
  });

  it('calculates full combination of discount, surcharge, and exclusive VAT correctly', () => {
    const state = createInitialOrderState(session, createBaseBill());

    // 1. Discount 10%
    const s1 = applyOrderEvent(state, {
      eventId: 'ev-c-1',
      type: 'DISCOUNT_APPLIED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: { type: 'percent', value: 10 },
      createdAt: '2026-10-29T10:01:00.000Z',
      schemaVersion: 1,
    });
    // Subtotal: 100,000; Discount: 10,000; Net: 90,000

    // 2. Surcharge 5% (on net 90,000 = 4,500 VND)
    const s2 = applyOrderEvent(s1, {
      eventId: 'ev-c-2',
      type: 'SURCHARGE_APPLIED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: { type: 'service_charge', name: 'Service', ratePercent: 5 },
      createdAt: '2026-10-29T10:02:00.000Z',
      schemaVersion: 1,
    });

    // 3. Exclusive VAT 10% (on net 90,000 = 9,000 VND)
    const s3 = applyOrderEvent(s2, {
      eventId: 'ev-c-3',
      type: 'TAX_UPDATED',
      sessionId: session._id,
      billId: state.bill._id,
      actorId: 'cashier-1',
      deviceId: 'T01',
      payload: {
        taxMode: 'exclusive',
        taxLines: [
          {
            rateId: 'vat_10',
            label: { vi: 'VAT', en: 'VAT' },
            rate: 10,
            base: money(0, 'VND'),
            amount: money(0, 'VND'),
          },
        ],
      },
      createdAt: '2026-10-29T10:03:00.000Z',
      schemaVersion: 1,
    });

    expect(s3.bill.subtotal.minor).toBe(100000);
    expect(s3.bill.discountTotal.minor).toBe(10000);
    expect(s3.bill.surchargeTotal.minor).toBe(4500);
    expect(s3.bill.taxTotal.minor).toBe(9000);
    // Total = Net (90,000) + Surcharge (4,500) + Exclusive Tax (9,000) = 103,500 VND
    expect(s3.bill.total.minor).toBe(103500);
    expect(s3.bill.balanceRemaining.minor).toBe(103500);
  });
});
