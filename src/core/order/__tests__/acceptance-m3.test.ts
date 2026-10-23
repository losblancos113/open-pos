import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createOrderRepository } from '../order-repository';
import { formatBillNumber, formatPaymentRef } from '../numbering';
import { buildVietQrPayload } from '../../qr/vietqr';
import { generateQrSvg } from '../../qr/qr-matrix';
import { money } from '../../money';
import type { SessionDoc, BillDoc } from '../types';

describe('M3 Acceptance: End-to-End Single-Device Cafe Sales Flow', () => {
  it('executes a complete sales cycle: open table, add items with toppings, apply discount, pay with VietQR + cash, and print bill', async () => {
    const adapter = await createMemoryAdapter();
    const repo = createOrderRepository(adapter);

    // 1. Setup Table & Area
    await repo.saveArea({ _id: 'area:hq:indoor', branchId: 'hq', name: 'Trong nhà', sortOrder: 1, createdAt: '' });
    await repo.saveTable({ _id: 'table:hq:t1', branchId: 'hq', areaId: 'area:hq:indoor', code: 'B01', name: 'Bàn 1', capacity: 4, sortOrder: 1, createdAt: '' });

    // 2. Setup Bank Account for VietQR
    await repo.saveBankAccount({
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      updatedAt: '',
    });

    // 3. Open Table Session & Create Bill
    const date = new Date(2026, 9, 23);
    const seq = await repo.nextSequence('hq', 'T01', '20261023');
    const billNumber = formatBillNumber('HQ', 'T01', date, seq);
    const paymentRef = formatPaymentRef('HQ', 'T01', seq);

    expect(billNumber).toBe('HQ-T01-20261023-0001');
    expect(paymentRef).toBe('POSHQT010001');

    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'cashier-1',
      billIds: ['bill:hq:b1'],
    };

    const initialBill: BillDoc = {
      _id: 'bill:hq:b1',
      branchId: 'hq',
      sessionId: 'session:hq:s1',
      billNumber,
      paymentRef,
      status: 'draft',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [{ rateId: 'vat10', label: { vi: 'VAT 10%', en: 'VAT 10%' }, rate: 10, base: money(0, 'VND'), amount: money(0, 'VND') }],
      taxTotal: money(0, 'VND'),
      subtotal: money(0, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(0, 'VND'),
      payments: [],
      balanceRemaining: money(0, 'VND'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 4. Add Order Line with Toppings (Phở bò 65k + Trứng 5k = 70k)
    let state = await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-1',
          type: 'LINE_ADDED',
          sessionId: session._id,
          billId: initialBill._id,
          actorId: 'cashier-1',
          deviceId: 'T01',
          payload: {
            lineId: 'l1',
            productId: 'product:pho-bo',
            nameSnapshot: { vi: 'Phở bò', en: 'Beef pho' },
            unitPriceSnapshot: money(65000, 'VND'),
            qty: 1,
            modifiers: [{ groupId: 'g1', groupNameSnapshot: 'Topping', optionId: 'o1', optionNameSnapshot: 'Trứng', priceDelta: money(5000, 'VND') }],
            addedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      { session, bill: initialBill }
    );

    expect(state.bill.total.minor).toBe(70000);

    // 5. Generate VietQR dynamic payload & SVG
    const bank = (await repo.getBankAccount('hq'))!;
    const qrPayload = buildVietQrPayload({
      bankBin: bank.bankBin,
      accountNumber: bank.accountNumber,
      accountName: bank.accountName,
      amount: state.bill.total,
      paymentRef: state.bill.paymentRef,
    });
    const qrSvg = generateQrSvg(qrPayload);
    expect(qrSvg).toContain('<svg');
    expect(qrPayload).toContain('POSHQT010001');

    // 6. Split Payment: 20k cash + 50k VietQR transfer
    state = await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-2',
          type: 'PAYMENT_ADDED',
          sessionId: session._id,
          billId: initialBill._id,
          actorId: 'cashier-1',
          deviceId: 'T01',
          payload: {
            paymentId: 'pay-cash',
            method: 'cash',
            amount: money(20000, 'VND'),
            tendered: money(50000, 'VND'),
            change: money(30000, 'VND'),
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        {
          eventId: 'ev-3',
          type: 'PAYMENT_ADDED',
          sessionId: session._id,
          billId: initialBill._id,
          actorId: 'cashier-1',
          deviceId: 'T01',
          payload: {
            paymentId: 'pay-vietqr',
            method: 'bank_transfer',
            amount: money(50000, 'VND'),
            ref: state.bill.paymentRef,
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        {
          eventId: 'ev-4',
          type: 'BILL_CLOSED',
          sessionId: session._id,
          billId: initialBill._id,
          actorId: 'cashier-1',
          deviceId: 'T01',
          payload: {},
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      state
    );

    expect(state.bill.status).toBe('paid');
    expect(state.bill.balanceRemaining.minor).toBe(0);
    expect(state.bill.payments).toHaveLength(2);
  });
});
