import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { DbAdapter } from '../../db/adapter';
import { createOrderRepository, type OrderRepository } from '../order-repository';
import { money } from '../../money';
import type { SessionDoc, BillDoc, AreaDoc, TableDoc } from '../types';
import type { OrderEventDoc, SessionEventsDoc } from '../events';

describe('OrderRepository', () => {
  let adapter: DbAdapter;
  let repo: OrderRepository;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    repo = createOrderRepository(adapter);
  });

  it('increments daily sequence counter sequentially', async () => {
    const s1 = await repo.nextSequence('hq', 'T01', '20261023');
    const s2 = await repo.nextSequence('hq', 'T01', '20261023');
    const s3 = await repo.nextSequence('hq', 'T01', '20261023');
    expect(s1).toBe(1);
    expect(s2).toBe(2);
    expect(s3).toBe(3);

    // Different device has independent counter
    const d1 = await repo.nextSequence('hq', 'T02', '20261023');
    expect(d1).toBe(1);

    // Different date has independent counter
    const nextDay = await repo.nextSequence('hq', 'T01', '20261024');
    expect(nextDay).toBe(1);
  });

  it('saves and retrieves bank account for VietQR', async () => {
    await repo.saveBankAccount({
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '0901234567',
      accountName: 'NGUYEN VAN A',
      updatedAt: new Date().toISOString(),
    });
    const acc = await repo.getBankAccount('hq');
    expect(acc).not.toBeNull();
    expect(acc?.accountNumber).toBe('0901234567');
    expect(acc?.bankBin).toBe('970422');
    expect(acc?.bankName).toBe('MBBank');
    expect(acc?.accountName).toBe('NGUYEN VAN A');
  });

  it('returns null when bank account does not exist', async () => {
    const acc = await repo.getBankAccount('unknown-branch');
    expect(acc).toBeNull();
  });

  it('saves and retrieves areas and tables for floor plan', async () => {
    const area1: AreaDoc = {
      _id: 'area:hq:indoor',
      branchId: 'hq',
      name: 'Trong nhà',
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    const area2: AreaDoc = {
      _id: 'area:hq:outdoor',
      branchId: 'hq',
      name: 'Sân vườn',
      sortOrder: 2,
      createdAt: new Date().toISOString(),
    };
    await repo.saveArea(area2);
    await repo.saveArea(area1);

    const table1: TableDoc = {
      _id: 'table:hq:t1',
      branchId: 'hq',
      areaId: 'area:hq:indoor',
      code: 'B01',
      name: 'Bàn 1',
      capacity: 4,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    };
    const table2: TableDoc = {
      _id: 'table:hq:t2',
      branchId: 'hq',
      areaId: 'area:hq:outdoor',
      code: 'B02',
      name: 'Bàn 2',
      capacity: 2,
      sortOrder: 2,
      createdAt: new Date().toISOString(),
    };
    await repo.saveTable(table2);
    await repo.saveTable(table1);

    const result = await repo.getAreasAndTables('hq');
    expect(result.areas).toHaveLength(2);
    expect(result.areas[0]?.name).toBe('Trong nhà');
    expect(result.areas[1]?.name).toBe('Sân vườn');

    expect(result.tables).toHaveLength(2);
    expect(result.tables[0]?.code).toBe('B01');
    expect(result.tables[1]?.code).toBe('B02');
  });

  it('appends events and updates session events doc with snapshot', async () => {
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initial = { session, bill };
    const event1: OrderEventDoc = {
      eventId: 'ev-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Món 1', en: 'Item 1' },
        unitPriceSnapshot: money(50000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: new Date().toISOString(),
      },
      createdAt: new Date().toISOString(),
      schemaVersion: 1,
    };

    const state = await repo.appendEvents('hq', session._id, [event1], initial);
    expect(state.bill.subtotal.minor).toBe(50000);
    expect(state.bill.total.minor).toBe(50000);
    expect(state.bill.lines).toHaveLength(1);

    // Verify SessionEventsDoc in adapter
    const rawEventsDoc = (await adapter.get('session_events:hq:s1')) as SessionEventsDoc | null;
    expect(rawEventsDoc).not.toBeNull();
    expect(rawEventsDoc?.events).toHaveLength(1);
    expect(rawEventsDoc?.events[0]?.eventId).toBe('ev-1');
    expect(rawEventsDoc?.snapshot?.bill.subtotal.minor).toBe(50000);
  });

  it('unions events on 409 conflict and retries without data loss', async () => {
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initial = { session, bill };

    // Terminal A prepares event 1
    const eventA: OrderEventDoc = {
      eventId: 'ev-A',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Phở bò', en: 'Beef pho' },
        unitPriceSnapshot: money(65000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: new Date().toISOString(),
      },
      createdAt: '2026-10-23T10:00:00.000Z',
      schemaVersion: 1,
    };

    // Terminal B prepares event B
    const eventB: OrderEventDoc = {
      eventId: 'ev-B',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c2',
      deviceId: 'T02',
      payload: {
        lineId: 'l2',
        productId: 'p2',
        nameSnapshot: { vi: 'Trà đá', en: 'Iced tea' },
        unitPriceSnapshot: money(5000, 'VND'),
        qty: 2,
        modifiers: [],
        addedAt: new Date().toISOString(),
      },
      createdAt: '2026-10-23T10:00:01.000Z',
      schemaVersion: 1,
    };

    // Step 1: Terminal B successfully appends eventB first
    await repo.appendEvents('hq', session._id, [eventB], initial);

    // Step 2: Simulate Terminal A that started before eventB, so it attempts with initial state
    // but the DB already has eventB. Our repo should detect the conflict or re-read and union!
    // To explicitly test the conflict retry mechanism, let's create a scenario where
    // adapter.put triggers conflict on the first attempt of an append.
    let putAttempts = 0;
    const originalPut = adapter.put.bind(adapter);
    adapter.put = async (doc) => {
      putAttempts++;
      if (putAttempts === 1 && doc._id.startsWith('session_events:')) {
        // Intentionally throw a conflict on first attempt
        throw new Error(`conflict: document ${doc._id} has _rev 1-concurrent, got ${doc._rev ?? 'undefined'}`);
      }
      return originalPut(doc);
    };

    const stateAfterA = await repo.appendEvents('hq', session._id, [eventA], initial);

    // Both orders must be present in the final state!
    expect(stateAfterA.bill.lines).toHaveLength(2);
    // 65000 (Phở bò) + 10000 (2x Trà đá) = 75000
    expect(stateAfterA.bill.subtotal.minor).toBe(75000);
    expect(stateAfterA.bill.total.minor).toBe(75000);

    // Both events must be in session_events doc
    const stored = (await adapter.get('session_events:hq:s1')) as SessionEventsDoc | null;
    expect(stored).not.toBeNull();
    const eventIds = stored!.events.map((e) => e.eventId);
    expect(eventIds).toContain('ev-A');
    expect(eventIds).toContain('ev-B');
  });

  it('materializes BillDoc and SessionDoc when bill reaches paid or BILL_CLOSED is emitted', async () => {
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initial = { session, bill };

    // 1. Add order line
    const state1 = await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-1',
          type: 'LINE_ADDED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: {
            lineId: 'l1',
            productId: 'p1',
            nameSnapshot: { vi: 'Cà phê sữa', en: 'Milk coffee' },
            unitPriceSnapshot: money(35000, 'VND'),
            qty: 1,
            modifiers: [],
            addedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      initial
    );

    // Not closed yet - BillDoc and SessionDoc should not be in adapter as separate docs
    let savedBill = (await adapter.get('bill:hq:b1')) as BillDoc | null;
    let savedSession = (await adapter.get('session:hq:s1')) as SessionDoc | null;
    expect(savedBill).toBeNull();
    expect(savedSession).toBeNull();

    // 2. Pay and Close bill
    const state2 = await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-2',
          type: 'PAYMENT_ADDED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: {
            paymentId: 'pay-1',
            method: 'cash',
            amount: money(35000, 'VND'),
            tendered: money(50000, 'VND'),
            change: money(15000, 'VND'),
            createdAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
        {
          eventId: 'ev-3',
          type: 'BILL_CLOSED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: {},
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      state1
    );

    expect(state2.bill.status).toBe('paid');
    expect(state2.session.status).toBe('closed');

    // Materialized documents must now exist in DB!
    savedBill = (await adapter.get('bill:hq:b1')) as BillDoc | null;
    savedSession = (await adapter.get('session:hq:s1')) as SessionDoc | null;
    expect(savedBill).not.toBeNull();
    expect(savedBill?.status).toBe('paid');
    expect(savedBill?.total.minor).toBe(35000);
    expect(savedSession).not.toBeNull();
    expect(savedSession?.status).toBe('closed');

    // SessionEventsDoc must have closedAt set
    const eventsDoc = (await adapter.get('session_events:hq:s1')) as SessionEventsDoc | null;
    expect(eventsDoc?.closedAt).toBeDefined();
    expect(eventsDoc?.snapshot?.bill.status).toBe('paid');
  });

  it('retrieves active session for a table via getActiveSession and returns null when closed or empty', async () => {
    const session: SessionDoc = {
      _id: 'session:hq:s1',
      branchId: 'hq',
      tableIds: ['table:hq:t1'],
      guestCount: 2,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // No session yet for table t1
    let active = await repo.getActiveSession('hq', 'table:hq:t1');
    expect(active).toBeNull();

    // Start session by appending event
    const state = await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-1',
          type: 'LINE_ADDED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: {
            lineId: 'l1',
            productId: 'p1',
            nameSnapshot: { vi: 'Phở bò', en: 'Beef pho' },
            unitPriceSnapshot: money(65000, 'VND'),
            qty: 1,
            modifiers: [],
            addedAt: new Date().toISOString(),
          },
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      { session, bill }
    );

    // Table t1 now has an active session
    active = await repo.getActiveSession('hq', 'table:hq:t1');
    expect(active).not.toBeNull();
    expect(active?.session._id).toBe('session:hq:s1');
    expect(active?.bill.subtotal.minor).toBe(65000);
    expect(active?.tableStatus).toBe('occupied');

    // Also supports passing short table ID
    const activeByShortId = await repo.getActiveSession('hq', 't1');
    expect(activeByShortId).not.toBeNull();
    expect(activeByShortId?.session._id).toBe('session:hq:s1');

    // Other table t2 is still empty
    const activeT2 = await repo.getActiveSession('hq', 'table:hq:t2');
    expect(activeT2).toBeNull();

    // Close the bill
    await repo.appendEvents(
      'hq',
      session._id,
      [
        {
          eventId: 'ev-close',
          type: 'BILL_CLOSED',
          sessionId: session._id,
          billId: bill._id,
          actorId: 'c1',
          deviceId: 'T01',
          payload: {},
          createdAt: new Date().toISOString(),
          schemaVersion: 1,
        },
      ],
      state
    );

    // After closing, table t1 is no longer active
    active = await repo.getActiveSession('hq', 'table:hq:t1');
    expect(active).toBeNull();
  });

  it('rejects invalid or empty branchId, deviceId, or dateStr in nextSequence', async () => {
    await expect(repo.nextSequence('', 'T01', '20261023')).rejects.toThrow(/branchId/i);
    await expect(repo.nextSequence('   ', 'T01', '20261023')).rejects.toThrow(/branchId/i);
    await expect(repo.nextSequence('hq:main', 'T01', '20261023')).rejects.toThrow(/must not contain ":"/);
    await expect(repo.nextSequence('hq', '', '20261023')).rejects.toThrow(/deviceId/i);
    await expect(repo.nextSequence('hq', 'T:01', '20261023')).rejects.toThrow(/must not contain ":"/);
    await expect(repo.nextSequence('hq', 'T01', '')).rejects.toThrow(/dateStr/i);
  });

  it('correctly replays historical events when snapshot is missing in session_events doc', async () => {
    const session: SessionDoc = {
      _id: 'session:hq:s-nosnap',
      branchId: 'hq',
      tableIds: ['table:hq:t2'],
      guestCount: 1,
      status: 'open',
      openedAt: new Date().toISOString(),
      openedBy: 'c1',
      billIds: ['bill:hq:b-nosnap'],
    };
    const bill: BillDoc = {
      _id: 'bill:hq:b-nosnap',
      branchId: 'hq',
      sessionId: 'session:hq:s-nosnap',
      billNumber: 'HQ-T01-20261023-0002',
      paymentRef: 'POSHQT010002',
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const initial = { session, bill };
    const histEvent: OrderEventDoc = {
      eventId: 'ev-hist-1',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l1',
        productId: 'p1',
        nameSnapshot: { vi: 'Bún bò Huế', en: 'Hue beef noodle' },
        unitPriceSnapshot: money(60000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T08:00:00.000Z',
      },
      createdAt: '2026-10-23T08:00:00.000Z',
      schemaVersion: 1,
    };

    // Put SessionEventsDoc directly into adapter with NO snapshot (simulating external sync)
    await adapter.put({
      _id: 'session_events:hq:s-nosnap',
      branchId: 'hq',
      sessionId: 's-nosnap',
      docType: 'session_events',
      schemaVersion: 1,
      events: [histEvent],
      createdAt: '2026-10-23T08:00:00.000Z',
      updatedAt: '2026-10-23T08:00:00.000Z',
    } as any);

    // Append new event
    const newEvent: OrderEventDoc = {
      eventId: 'ev-new-2',
      type: 'LINE_ADDED',
      sessionId: session._id,
      billId: bill._id,
      actorId: 'c1',
      deviceId: 'T01',
      payload: {
        lineId: 'l2',
        productId: 'p2',
        nameSnapshot: { vi: 'Chanh muối', en: 'Salted lemonade' },
        unitPriceSnapshot: money(20000, 'VND'),
        qty: 1,
        modifiers: [],
        addedAt: '2026-10-23T08:05:00.000Z',
      },
      createdAt: '2026-10-23T08:05:00.000Z',
      schemaVersion: 1,
    };

    const resultState = await repo.appendEvents('hq', session._id, [newEvent], initial);

    // Both historical event (60k) and new event (20k) must be present
    expect(resultState.bill.lines).toHaveLength(2);
    expect(resultState.bill.subtotal.minor).toBe(80000);
    expect(resultState.bill.total.minor).toBe(80000);

    // Verify snapshot was created and saved in adapter
    const savedDoc = (await adapter.get('session_events:hq:s-nosnap')) as SessionEventsDoc | null;
    expect(savedDoc?.snapshot).toBeDefined();
    expect(savedDoc?.snapshot?.bill.subtotal.minor).toBe(80000);
    expect(savedDoc?.events).toHaveLength(2);
  });

  it('retries on status 409 or name conflict error objects', async () => {
    let attempts = 0;
    const originalPut = adapter.put.bind(adapter);
    adapter.put = async (doc) => {
      attempts++;
      if (attempts === 1 && doc._id === 'bank_account:hq') {
        const err = new Error('conflict occurred') as any;
        err.status = 409;
        err.name = 'conflict';
        throw err;
      }
      return originalPut(doc);
    };

    await repo.saveBankAccount({
      _id: 'bank_account:hq',
      branchId: 'hq',
      bankBin: '970422',
      bankName: 'MBBank',
      accountNumber: '123456789',
      accountName: 'TEST USER',
      updatedAt: new Date().toISOString(),
    });

    const acc = await repo.getBankAccount('hq');
    expect(acc?.accountNumber).toBe('123456789');
    expect(attempts).toBe(2);
  });
});
