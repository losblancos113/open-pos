import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import { createShiftRepository } from '@/core/shift/shift-repository';
import { createAuditLogger } from '@/core/audit/audit-logger';
import { createOrderRepository } from '@/core/order/order-repository';
import {
  generateZReport,
  generateCategorySalesReport,
  generateHourlySalesReport,
} from '@/core/reports/store-reports';
import {
  exportZReportToCsv,
  exportCategoryReportToCsv,
  exportHourlyReportToCsv,
} from '@/core/reports/export';
import {
  exportDatabaseBackup,
  restoreDatabaseBackup,
} from '@/core/maintenance/backup-restore';
import { purgeExpiredGuestTokens } from '@/core/maintenance/token-cleanup';
import { money } from '@/core/money';

describe('Milestone 6c — Shifts, Reports & Hardening End-to-End Acceptance Test', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let shiftRepo: ReturnType<typeof createShiftRepository>;
  let auditLogger: ReturnType<typeof createAuditLogger>;
  let orderRepo: ReturnType<typeof createOrderRepository>;

  const BRANCH_HQ = 'hq';
  const DEVICE_01 = 'term_01';

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    shiftRepo = createShiftRepository(adapter);
    auditLogger = createAuditLogger(adapter);
    orderRepo = createOrderRepository(adapter);
  });

  it('runs complete lifecycle: shift open, sales, cash drops, close with variance, Z-report, export, audit log, backup/restore, and cleanup', async () => {
    // ──────────────────────────────────────────────────────────────────────────
    // 1. Open Shift
    // ──────────────────────────────────────────────────────────────────────────
    const shift = await shiftRepo.openShift({
      branchId: BRANCH_HQ,
      deviceId: DEVICE_01,
      userId: 'cashier_alice',
      userName: 'Alice',
      openingCash: money(500000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
      notes: 'Morning shift opening',
    });

    expect(shift.status).toBe('open');
    expect(shift.openingCash.minor).toBe(500000);

    // Audit log for shift opening
    await auditLogger.log({
      branchId: BRANCH_HQ,
      actorId: 'cashier_alice',
      role: 'cashier',
      action: 'shift_open',
      targetType: 'shift',
      targetId: shift.shiftId,
      deviceId: DEVICE_01,
      details: { openingCash: 500000 },
      createdAt: '2026-10-26T08:00:01.000Z',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Setup Category & Product Catalog
    // ──────────────────────────────────────────────────────────────────────────
    await adapter.put({
      _id: 'category:cat_drinks',
      branchId: '*',
      docType: 'catalog_category',
      schemaVersion: 1,
      categoryId: 'cat_drinks',
      name: { vi: 'Đồ uống', en: 'Drinks' },
    } as any);

    await adapter.put({
      _id: 'product:prod_cf',
      branchId: '*',
      docType: 'catalog_product',
      schemaVersion: 1,
      productId: 'prod_cf',
      categoryId: 'cat_drinks',
      name: { vi: 'Cà phê đen', en: 'Black Coffee' },
      basePrice: money(30000, 'VND'),
    } as any);

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Complete Sales (Cash and VietQR Bank Transfer)
    // ──────────────────────────────────────────────────────────────────────────
    // Sale 1: 2 coffees paid by CASH (60,000 VND)
    await orderRepo.appendEvents(BRANCH_HQ, 'sess_01', [
      {
        eventId: 'ev_01',
        type: 'SESSION_OPENED',
        sessionId: 'sess_01',
        billId: 'bill_01',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: { tableIds: ['t1'], openedAt: '2026-10-26T09:00:00.000Z' },
        createdAt: '2026-10-26T09:00:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_02',
        type: 'LINE_ADDED',
        sessionId: 'sess_01',
        billId: 'bill_01',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: {
          lineId: 'l1',
          productId: 'prod_cf',
          nameSnapshot: { vi: 'Cà phê đen', en: 'Black Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 2,
        },
        createdAt: '2026-10-26T09:01:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_03',
        type: 'PAYMENT_ADDED',
        sessionId: 'sess_01',
        billId: 'bill_01',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: {
          paymentId: 'pay_01',
          method: 'cash',
          amount: money(60000, 'VND'),
          tendered: money(100000, 'VND'),
          change: money(40000, 'VND'),
          createdAt: '2026-10-26T09:05:00.000Z',
        },
        createdAt: '2026-10-26T09:05:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // Sale 2: 1 coffee paid by VIETQR BANK TRANSFER (30,000 VND)
    await orderRepo.appendEvents(BRANCH_HQ, 'sess_02', [
      {
        eventId: 'ev_04',
        type: 'SESSION_OPENED',
        sessionId: 'sess_02',
        billId: 'bill_02',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: { tableIds: ['t2'], openedAt: '2026-10-26T10:00:00.000Z' },
        createdAt: '2026-10-26T10:00:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_05',
        type: 'LINE_ADDED',
        sessionId: 'sess_02',
        billId: 'bill_02',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: {
          lineId: 'l2',
          productId: 'prod_cf',
          nameSnapshot: { vi: 'Cà phê đen', en: 'Black Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 1,
        },
        createdAt: '2026-10-26T10:01:00.000Z',
        schemaVersion: 1,
      },
      {
        eventId: 'ev_06',
        type: 'PAYMENT_ADDED',
        sessionId: 'sess_02',
        billId: 'bill_02',
        actorId: 'cashier_alice',
        deviceId: DEVICE_01,
        payload: {
          paymentId: 'pay_02',
          method: 'bank_transfer',
          amount: money(30000, 'VND'),
          tendered: money(30000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-26T10:05:00.000Z',
        },
        createdAt: '2026-10-26T10:05:00.000Z',
        schemaVersion: 1,
      },
    ]);

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Mid-Shift Cash Movement (Cash Drop to Safe)
    // ──────────────────────────────────────────────────────────────────────────
    await shiftRepo.recordCashMovement({
      branchId: BRANCH_HQ,
      shiftId: shift.shiftId,
      type: 'cash_drop',
      amount: money(200000, 'VND'),
      reason: 'Rút tiền gửi két an toàn',
      actorId: 'cashier_alice',
      createdAt: '2026-10-26T12:00:00.000Z',
    });

    await auditLogger.log({
      branchId: BRANCH_HQ,
      actorId: 'cashier_alice',
      role: 'cashier',
      action: 'cash_drop',
      targetType: 'shift',
      targetId: shift.shiftId,
      deviceId: DEVICE_01,
      details: { amount: 200000 },
      createdAt: '2026-10-26T12:00:01.000Z',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 5. Close Shift with Physical Cash Counting & Variance Calculation
    // ──────────────────────────────────────────────────────────────────────────
    // Expected cash in drawer:
    // Opening Cash: 500,000 VND
    // + Cash Sales: 60,000 VND
    // - Cash Drop:  200,000 VND
    // = Expected:   360,000 VND
    // Physical counted cash: 350,000 VND (Shortage of 10,000 VND)
    const closedShift = await shiftRepo.closeShift({
      branchId: BRANCH_HQ,
      shiftId: shift.shiftId,
      countedCash: money(350000, 'VND'),
      closedBy: 'cashier_alice',
      closedAt: '2026-10-26T17:00:00.000Z',
      notes: 'Ca kết thúc, thiếu 10k do trả thừa tiền lẻ',
    });

    expect(closedShift.status).toBe('closed');
    expect(closedShift.closingCash?.minor).toBe(360000);
    expect(closedShift.countedCash?.minor).toBe(350000);
    expect(closedShift.variance?.minor).toBe(-10000); // Exact negative variance

    await auditLogger.log({
      branchId: BRANCH_HQ,
      actorId: 'cashier_alice',
      role: 'cashier',
      action: 'shift_close',
      targetType: 'shift',
      targetId: shift.shiftId,
      deviceId: DEVICE_01,
      details: { variance: -10000 },
      createdAt: '2026-10-26T17:00:01.000Z',
    });

    // ──────────────────────────────────────────────────────────────────────────
    // 6. Generate Store Reports & Z-Report
    // ──────────────────────────────────────────────────────────────────────────
    const zReport = await generateZReport(adapter, BRANCH_HQ, { shiftId: shift.shiftId });

    expect(zReport.totalBills).toBe(2);
    expect(zReport.paidBills).toBe(2);
    expect(zReport.grossSales.minor).toBe(90000);
    expect(zReport.netSales.minor).toBe(90000);
    expect(zReport.paymentsByMethod['cash']?.minor).toBe(60000);
    expect(zReport.paymentsByMethod['bank_transfer']?.minor).toBe(30000);
    expect(zReport.expectedCash.minor).toBe(360000);
    expect(zReport.countedCash?.minor).toBe(350000);
    expect(zReport.variance?.minor).toBe(-10000);

    // Category Sales Report
    const categories = await generateCategorySalesReport(adapter, BRANCH_HQ, {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });
    expect(categories).toHaveLength(1);
    expect(categories[0]?.categoryName).toBe('Đồ uống');
    expect(categories[0]?.quantitySold).toBe(3);
    expect(categories[0]?.netRevenue.minor).toBe(90000);
    expect(categories[0]?.percentageOfTotal).toBe(100);

    // Hourly Sales Report
    const hourly = await generateHourlySalesReport(adapter, BRANCH_HQ, {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });
    expect(hourly).toHaveLength(24);
    expect(hourly[9]?.orderCount).toBe(1); // 09:00 hour
    expect(hourly[10]?.orderCount).toBe(1); // 10:00 hour
    expect(hourly[12]?.orderCount).toBe(0); // 12:00 hour

    // ──────────────────────────────────────────────────────────────────────────
    // 7. Export CSV Reports
    // ──────────────────────────────────────────────────────────────────────────
    const zReportCsv = exportZReportToCsv(zReport);
    expect(zReportCsv).toContain('Gross Sales,90000');
    expect(zReportCsv).toContain('Expected Cash,360000');
    expect(zReportCsv).toContain('Variance,-10000');

    const catCsv = exportCategoryReportToCsv(categories);
    expect(catCsv).toContain('cat_drinks,Đồ uống,3,90000,100%');

    const hourlyCsv = exportHourlyReportToCsv(hourly);
    expect(hourlyCsv).toContain('09:00 - 09:59,1,60000');
    expect(hourlyCsv).toContain('10:00 - 10:59,1,30000');

    // ──────────────────────────────────────────────────────────────────────────
    // 8. Audit Log Verification
    // ──────────────────────────────────────────────────────────────────────────
    const auditLogs = await auditLogger.getLogs(BRANCH_HQ);
    expect(auditLogs).toHaveLength(3);
    expect(auditLogs[0]?.action).toBe('shift_open');
    expect(auditLogs[1]?.action).toBe('cash_drop');
    expect(auditLogs[2]?.action).toBe('shift_close');

    // ──────────────────────────────────────────────────────────────────────────
    // 9. Database Backup & Restore Utility
    // ──────────────────────────────────────────────────────────────────────────
    const backupSnapshot = await exportDatabaseBackup(adapter);
    expect(backupSnapshot.schemaVersion).toBe(1);
    expect(backupSnapshot.docCount).toBeGreaterThan(5);

    const freshAdapter = await createMemoryAdapter();
    const restoreResult = await restoreDatabaseBackup(freshAdapter, backupSnapshot);
    expect(restoreResult.restoredCount).toBe(backupSnapshot.docCount);

    const restoredShift = await freshAdapter.get(`shift:${BRANCH_HQ}:${shift.shiftId}`);
    expect(restoredShift).not.toBeNull();
    expect((restoredShift as any).status).toBe('closed');

    // ──────────────────────────────────────────────────────────────────────────
    // 10. Maintenance: Token Cleanup Utility
    // ──────────────────────────────────────────────────────────────────────────
    await adapter.put({
      _id: 'guest_session:sess_temp_01',
      branchId: BRANCH_HQ,
      docType: 'guest_session',
      schemaVersion: 1,
      expiresAt: '2026-10-26T00:00:00.000Z', // Expired
      tableId: 't1',
    } as any);

    const purged = await purgeExpiredGuestTokens(adapter, '2026-10-26T18:00:00.000Z');
    expect(purged).toBe(1);

    const expiredGuest = await adapter.get('guest_session:sess_temp_01');
    expect(expiredGuest).toBeNull();
  });
});
