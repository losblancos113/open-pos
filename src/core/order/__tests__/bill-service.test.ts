import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { money } from '../../money';
import type { BillDoc } from '../types';
import {
  listBills,
  getBill,
  voidBill,
  updateBillNote,
  canEditBill,
} from '../bill-service';

describe('bill-service', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  const branchId = 'branch_01';

  const sampleBill1: BillDoc = {
    _id: `bill:${branchId}:b1`,
    branchId,
    sessionId: 'sess_1',
    billNumber: 'HN01-T01-20261029-0001',
    paymentRef: 'POSHN01001',
    status: 'paid',
    lines: [
      {
        lineId: 'line_1',
        productId: 'prod_coffee',
        nameSnapshot: { vi: 'Cà phê đen', en: 'Black Coffee' },
        unitPriceSnapshot: money(30000, 'VND'),
        qty: 2,
        modifiers: [],
        status: 'placed',
        addedAt: '2026-10-29T08:00:00.000Z',
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(60000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(60000, 'VND'),
    payments: [
      {
        paymentId: 'pay_1',
        method: 'cash',
        amount: money(60000, 'VND'),
        createdAt: '2026-10-29T08:10:00.000Z',
      },
    ],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-29T08:00:00.000Z',
    updatedAt: '2026-10-29T08:10:00.000Z',
    paidAt: '2026-10-29T08:10:00.000Z',
    tableNameSnapshot: 'Bàn 1',
  };

  const sampleBill2: BillDoc = {
    _id: `bill:${branchId}:b2`,
    branchId,
    sessionId: 'sess_2',
    billNumber: 'HN01-T01-20261029-0002',
    paymentRef: 'POSHN01002',
    status: 'placed',
    lines: [
      {
        lineId: 'line_2',
        productId: 'prod_tea',
        nameSnapshot: { vi: 'Trà đào cam sả', en: 'Peach Tea' },
        unitPriceSnapshot: money(45000, 'VND'),
        qty: 1,
        modifiers: [],
        status: 'placed',
        addedAt: '2026-10-29T09:00:00.000Z',
      },
    ],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(45000, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(45000, 'VND'),
    payments: [
      {
        paymentId: 'pay_2',
        method: 'bank_transfer',
        amount: money(45000, 'VND'),
        createdAt: '2026-10-29T09:05:00.000Z',
      },
    ],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-29T09:00:00.000Z',
    updatedAt: '2026-10-29T09:00:00.000Z',
    tableNameSnapshot: 'Bàn 5',
    note: 'Ít đường',
  };

  const sampleBillOtherBranch: BillDoc = {
    ...sampleBill1,
    _id: 'bill:other_branch:b3',
    branchId: 'other_branch',
    billNumber: 'OTHER-0001',
  };

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    await adapter.put({ ...sampleBill1, docType: 'bill', schemaVersion: 1 } as any);
    await adapter.put({ ...sampleBill2, docType: 'bill', schemaVersion: 1 } as any);
    await adapter.put({ ...sampleBillOtherBranch, docType: 'bill', schemaVersion: 1 } as any);
  });

  describe('listBills', () => {
    it('returns bills scoped to the branch', async () => {
      const bills = await listBills(adapter, branchId);
      expect(bills).toHaveLength(2);
      expect(bills.map((b) => b._id)).toEqual(
        expect.arrayContaining([`bill:${branchId}:b1`, `bill:${branchId}:b2`]),
      );
    });

    it('filters by status', async () => {
      const paidBills = await listBills(adapter, branchId, { status: 'paid' });
      expect(paidBills).toHaveLength(1);
      expect(paidBills[0]?.billNumber).toBe('HN01-T01-20261029-0001');

      const placedBills = await listBills(adapter, branchId, { status: 'placed' });
      expect(placedBills).toHaveLength(1);
      expect(placedBills[0]?.billNumber).toBe('HN01-T01-20261029-0002');
    });

    it('filters by paymentMethod', async () => {
      const cashBills = await listBills(adapter, branchId, { paymentMethod: 'cash' });
      expect(cashBills).toHaveLength(1);
      expect(cashBills[0]?.billNumber).toBe('HN01-T01-20261029-0001');

      const bankBills = await listBills(adapter, branchId, { paymentMethod: 'bank_transfer' });
      expect(bankBills).toHaveLength(1);
      expect(bankBills[0]?.billNumber).toBe('HN01-T01-20261029-0002');
    });

    it('filters by search query matching billNumber, table, note or item name', async () => {
      const byNumber = await listBills(adapter, branchId, { query: '0001' });
      expect(byNumber).toHaveLength(1);
      expect(byNumber[0]?.billNumber).toBe('HN01-T01-20261029-0001');

      const byTable = await listBills(adapter, branchId, { query: 'bàn 5' });
      expect(byTable).toHaveLength(1);
      expect(byTable[0]?.billNumber).toBe('HN01-T01-20261029-0002');

      const byNote = await listBills(adapter, branchId, { query: 'ít đường' });
      expect(byNote).toHaveLength(1);

      const byItem = await listBills(adapter, branchId, { query: 'peach' });
      expect(byItem).toHaveLength(1);
    });

    it('sorts bills correctly', async () => {
      const sortedByAmount = await listBills(adapter, branchId, { sortBy: 'highestAmount' });
      expect(sortedByAmount[0]?.total.minor).toBe(60000);
      expect(sortedByAmount[1]?.total.minor).toBe(45000);

      const sortedOldest = await listBills(adapter, branchId, { sortBy: 'oldest' });
      expect(sortedOldest[0]?.createdAt).toBe('2026-10-29T08:00:00.000Z');
      expect(sortedOldest[1]?.createdAt).toBe('2026-10-29T09:00:00.000Z');
    });
  });

  describe('getBill', () => {
    it('retrieves bill with or without bill prefix', async () => {
      const b1 = await getBill(adapter, branchId, `bill:${branchId}:b1`);
      expect(b1).not.toBeNull();
      expect(b1?.billNumber).toBe('HN01-T01-20261029-0001');

      const b2 = await getBill(adapter, branchId, 'b2');
      expect(b2).not.toBeNull();
      expect(b2?.billNumber).toBe('HN01-T01-20261029-0002');
    });

    it('returns null for nonexistent bill', async () => {
      const notFound = await getBill(adapter, branchId, 'nonexistent');
      expect(notFound).toBeNull();
    });
  });

  describe('voidBill', () => {
    it('successfully voids an invoice and records audit data', async () => {
      const mockClock = () => '2026-10-29T10:00:00.000Z';
      const voided = await voidBill(adapter, branchId, 'b1', {
        reason: 'Khách đổi ý huỷ đơn',
        actorId: 'user_admin',
        actorName: 'Quản Lý Nguyễn',
        clock: mockClock,
      });

      expect(voided.status).toBe('voided');
      expect(voided.voidReason).toBe('Khách đổi ý huỷ đơn');
      expect(voided.voidedBy).toBe('Quản Lý Nguyễn');
      expect(voided.voidedAt).toBe('2026-10-29T10:00:00.000Z');

      const fromDb = await getBill(adapter, branchId, 'b1');
      expect(fromDb?.status).toBe('voided');
      expect(fromDb?.voidReason).toBe('Khách đổi ý huỷ đơn');
    });

    it('throws if reason is missing', async () => {
      await expect(
        voidBill(adapter, branchId, 'b1', {
          reason: '   ',
          actorId: 'user_admin',
        }),
      ).rejects.toThrow('voidBill(): reason is required');
    });

    it('throws if already voided', async () => {
      await voidBill(adapter, branchId, 'b1', {
        reason: 'Lý do 1',
        actorId: 'admin',
      });

      await expect(
        voidBill(adapter, branchId, 'b1', {
          reason: 'Lý do 2',
          actorId: 'admin',
        }),
      ).rejects.toThrow('already voided');
    });
  });

  describe('updateBillNote', () => {
    it('updates bill note successfully', async () => {
      const updated = await updateBillNote(adapter, branchId, 'b1', 'Giao hàng tận nơi lúc 12h');
      expect(updated.note).toBe('Giao hàng tận nơi lúc 12h');

      const fromDb = await getBill(adapter, branchId, 'b1');
      expect(fromDb?.note).toBe('Giao hàng tận nơi lúc 12h');
    });
  });

  describe('canEditBill', () => {
    it('auto-resolves tableNameSnapshot from session and table docs when bill document lacks tableNameSnapshot', async () => {
      // Seed table
      await adapter.put({
        _id: `table:${branchId}:t10`,
        branchId,
        docType: 'table',
        name: 'Bàn VIP 10',
        code: 'T10',
        areaId: 'area_1',
        capacity: 4,
        sortOrder: 1,
        createdAt: '2026-10-29T08:00:00.000Z',
      } as any);

      // Seed session with tableIds
      await adapter.put({
        _id: `session:${branchId}:sess_vip`,
        branchId,
        docType: 'session',
        tableIds: [`table:${branchId}:t10`],
        billIds: [`bill:${branchId}:b_vip`],
        guestCount: 4,
        status: 'closed',
        openedAt: '2026-10-29T11:00:00.000Z',
        openedBy: 'cashier',
      } as any);

      // Seed bill with NO tableNameSnapshot
      await adapter.put({
        _id: `bill:${branchId}:b_vip`,
        branchId,
        sessionId: 'sess_vip',
        billNumber: 'HN01-T01-20261029-0099',
        paymentRef: 'POSHN01099',
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
            paymentId: 'pay_vip',
            method: 'cash',
            amount: money(150000, 'VND'),
            createdAt: '2026-10-29T11:30:00.000Z',
          },
        ],
        balanceRemaining: money(0, 'VND'),
        createdAt: '2026-10-29T11:00:00.000Z',
        updatedAt: '2026-10-29T11:30:00.000Z',
        paidAt: '2026-10-29T11:30:00.000Z',
      } as any);

      // listBills should auto-resolve the table name
      const bills = await listBills(adapter, branchId);
      const vipBill = bills.find((b) => b._id === `bill:${branchId}:b_vip`);
      expect(vipBill).toBeDefined();
      expect(vipBill?.tableNameSnapshot).toBe('Bàn VIP 10');

      // Querying by table name should match
      const queried = await listBills(adapter, branchId, { query: 'VIP' });
      expect(queried.some((b) => b._id === `bill:${branchId}:b_vip`)).toBe(true);

      // getBill should also auto-resolve
      const single = await getBill(adapter, branchId, 'b_vip');
      expect(single?.tableNameSnapshot).toBe('Bàn VIP 10');
    });

    it('returns true for owner and manager only', () => {
      expect(canEditBill('owner')).toBe(true);
      expect(canEditBill('manager')).toBe(true);
      expect(canEditBill('cashier')).toBe(false);
      expect(canEditBill('waiter')).toBe(false);
      expect(canEditBill('kitchen')).toBe(false);
      expect(canEditBill('staff')).toBe(false);
      expect(canEditBill(null)).toBe(false);
      expect(canEditBill(undefined)).toBe(false);
    });
  });
});
