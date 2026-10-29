import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import {
  generateZReport,
  generateCategorySalesReport,
  generateHourlySalesReport,
} from '../store-reports';
import { money } from '../../money';
import type { BillDoc } from '../../order/types';
import type { ShiftDoc, ShiftCashMovementDoc } from '../../shift/types';
import { shiftDocId, shiftCashMovementDocId } from '../../db/ids';
import { createCategoryDoc } from '../../catalog/category';
import { createProductDoc } from '../../catalog/product';

describe('Store Reports Engine', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
  });

  it('generates Z-Report with sales, discounts, taxes, payment breakdowns, and shift cash reconciliation', async () => {
    // 1. Seed a shift
    const shift: ShiftDoc = {
      _id: shiftDocId('hq', 'sh_100'),
      branchId: 'hq',
      docType: 'shift',
      schemaVersion: 1,
      shiftId: 'sh_100',
      deviceId: 'term_01',
      userId: 'u1',
      userName: 'Alice',
      status: 'closed',
      openingCash: money(1000000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
      closingCash: money(1650000, 'VND'),
      countedCash: money(1650000, 'VND'),
      variance: money(0, 'VND'),
      closedAt: '2026-10-26T17:00:00.000Z',
      closedBy: 'u1',
    };
    await adapter.put(shift as unknown as any);

    // 2. Seed a cash movement for the shift
    const cashDrop: ShiftCashMovementDoc = {
      _id: shiftCashMovementDocId('hq', 'mov_01'),
      branchId: 'hq',
      docType: 'shift_cash_movement',
      schemaVersion: 1,
      movementId: 'mov_01',
      shiftId: 'sh_100',
      type: 'cash_drop',
      amount: money(200000, 'VND'),
      reason: 'Midday drop',
      actorId: 'u1',
      createdAt: '2026-10-26T12:00:00.000Z',
    };
    await adapter.put(cashDrop as unknown as any);

    // 3. Seed paid bill #1: Cash payment (500,000 VND)
    const bill1: BillDoc = {
      _id: 'bill:hq:b101',
      branchId: 'hq',
      sessionId: 's101',
      billNumber: 'B-101',
      paymentRef: 'P-101',
      status: 'paid',
      lines: [
        {
          lineId: 'l1',
          productId: 'prod_coffee',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(50000, 'VND'),
          qty: 10,
          status: 'placed',
          addedAt: '2026-10-26T10:00:00.000Z',
          modifiers: [],
        },
      ],
      discounts: [
        {
          type: 'percent',
          value: 10,
          reason: 'VIP 10%',
        },
      ],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(500000, 'VND'),
      discountTotal: money(50000, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(450000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(450000, 'VND'),
          tendered: money(500000, 'VND'),
          change: money(50000, 'VND'),
          createdAt: '2026-10-26T10:05:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:05:00.000Z',
    };
    await adapter.put(bill1 as unknown as any);

    // 4. Seed paid bill #2: VietQR payment (400,000 VND)
    const bill2: BillDoc = {
      _id: 'bill:hq:b102',
      branchId: 'hq',
      sessionId: 's102',
      billNumber: 'B-102',
      paymentRef: 'P-102',
      status: 'paid',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(400000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(400000, 'VND'),
      payments: [
        {
          paymentId: 'pay2',
          method: 'bank_transfer',
          amount: money(400000, 'VND'),
          tendered: money(400000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-26T14:00:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T14:00:00.000Z',
      updatedAt: '2026-10-26T14:05:00.000Z',
    };
    await adapter.put(bill2 as unknown as any);

    // 5. Generate Z-Report for shift 'sh_100'
    const report = await generateZReport(adapter, 'hq', { shiftId: 'sh_100' });

    expect(report.branchId).toBe('hq');
    expect(report.shiftId).toBe('sh_100');
    expect(report.totalBills).toBe(2);
    expect(report.paidBills).toBe(2);
    expect(report.voidedBills).toBe(0);
    expect(report.grossSales.minor).toBe(900000); // 500k + 400k
    expect(report.discountTotal.minor).toBe(50000);
    expect(report.netSales.minor).toBe(850000); // 450k + 400k
    expect(report.paymentsByMethod['cash']?.minor).toBe(450000);
    expect(report.paymentsByMethod['bank_transfer']?.minor).toBe(400000);
    expect(report.openingCash.minor).toBe(1000000);
    expect(report.cashSales.minor).toBe(450000);
    expect(report.cashDrops.minor).toBe(200000);
    // expectedCash: 1,000,000 + 450,000 - 200,000 = 1,250,000
    expect(report.expectedCash.minor).toBe(1250000);
  });

  it('generates category sales report with quantities and percentage share', async () => {
    // Seed product catalog with categories
    await adapter.put({
      _id: 'product:prod_cf',
      branchId: '*',
      docType: 'catalog_product',
      productId: 'prod_cf',
      categoryId: 'cat_drinks',
      name: { vi: 'Cà phê', en: 'Coffee' },
    } as any);

    await adapter.put({
      _id: 'product:prod_cake',
      branchId: '*',
      docType: 'catalog_product',
      productId: 'prod_cake',
      categoryId: 'cat_bakery',
      name: { vi: 'Bánh ngọt', en: 'Cake' },
    } as any);

    await adapter.put({
      _id: 'category:cat_drinks',
      branchId: '*',
      docType: 'catalog_category',
      categoryId: 'cat_drinks',
      name: { vi: 'Đồ uống', en: 'Drinks' },
    } as any);

    await adapter.put({
      _id: 'category:cat_bakery',
      branchId: '*',
      docType: 'catalog_category',
      categoryId: 'cat_bakery',
      name: { vi: 'Bánh & Tráng miệng', en: 'Bakery' },
    } as any);

    // Bill with 4 coffees (120k) and 1 cake (80k) -> Total 200k
    const bill: BillDoc = {
      _id: 'bill:hq:b200',
      branchId: 'hq',
      sessionId: 's200',
      billNumber: 'B-200',
      paymentRef: 'P-200',
      status: 'paid',
      lines: [
        {
          lineId: 'l1',
          productId: 'prod_cf',
          nameSnapshot: { vi: 'Cà phê', en: 'Coffee' },
          unitPriceSnapshot: money(30000, 'VND'),
          qty: 4,
          status: 'placed',
          addedAt: '2026-10-26T10:00:00.000Z',
          modifiers: [],
        },
        {
          lineId: 'l2',
          productId: 'prod_cake',
          nameSnapshot: { vi: 'Bánh ngọt', en: 'Cake' },
          unitPriceSnapshot: money(80000, 'VND'),
          qty: 1,
          status: 'placed',
          addedAt: '2026-10-26T10:00:00.000Z',
          modifiers: [],
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(200000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(200000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(200000, 'VND'),
          tendered: money(200000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-26T10:05:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T10:00:00.000Z',
      updatedAt: '2026-10-26T10:05:00.000Z',
    };
    await adapter.put(bill as unknown as any);

    const categories = await generateCategorySalesReport(adapter, 'hq', {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });

    expect(categories).toHaveLength(2);
    const drinks = categories.find((c) => c.categoryId === 'cat_drinks');
    expect(drinks?.quantitySold).toBe(4);
    expect(drinks?.netRevenue.minor).toBe(120000);
    expect(drinks?.percentageOfTotal).toBe(60); // 120k / 200k = 60%
    expect(drinks?.items).toHaveLength(1);
    expect(drinks?.items?.[0]?.productName).toBe('Cà phê');
    expect(drinks?.items?.[0]?.quantitySold).toBe(4);
    expect(drinks?.items?.[0]?.netRevenue.minor).toBe(120000);
    expect(drinks?.items?.[0]?.percentageOfCategory).toBe(100);

    const bakery = categories.find((c) => c.categoryId === 'cat_bakery');
    expect(bakery?.quantitySold).toBe(1);
    expect(bakery?.netRevenue.minor).toBe(80000);
    expect(bakery?.percentageOfTotal).toBe(40); // 80k / 200k = 40%
    expect(bakery?.items).toHaveLength(1);
    expect(bakery?.items?.[0]?.productName).toBe('Bánh ngọt');
    expect(bakery?.items?.[0]?.quantitySold).toBe(1);
    expect(bakery?.items?.[0]?.netRevenue.minor).toBe(80000);
    expect(bakery?.items?.[0]?.percentageOfCategory).toBe(100);
  });

  it('generates hourly sales report covering all 24 hours (0..23)', async () => {
    // Bill at 10:30 UTC
    const bill: BillDoc = {
      _id: 'bill:hq:b300',
      branchId: 'hq',
      sessionId: 's300',
      billNumber: 'B-300',
      paymentRef: 'P-300',
      status: 'paid',
      lines: [],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(75000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(75000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(75000, 'VND'),
          tendered: money(75000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-26T10:30:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T10:30:00.000Z',
      updatedAt: '2026-10-26T10:35:00.000Z',
    };
    await adapter.put(bill as unknown as any);

    const hourly = await generateHourlySalesReport(adapter, 'hq', {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });

    expect(hourly).toHaveLength(24);
    expect(hourly[10]?.hour).toBe(10);
    expect(hourly[10]?.orderCount).toBe(1);
    expect(hourly[10]?.netRevenue.minor).toBe(75000);

    // Other hours should have 0 orders and 0 money
    expect(hourly[0]?.hour).toBe(0);
    expect(hourly[0]?.orderCount).toBe(0);
    expect(hourly[0]?.netRevenue.minor).toBe(0);
  });

  it('correctly maps standard catalog_product and catalog_category documents created with createProductDoc and createCategoryDoc', async () => {
    const cat = createCategoryDoc({
      id: 'main_dish',
      name: { vi: 'Món chính', en: 'Main Course' },
    });
    await adapter.put(cat);

    const phoBo = createProductDoc({
      id: 'pho-bo',
      name: { vi: 'Phở Bò', en: 'Beef Pho' },
      basePrice: money(55000, 'VND'),
      categoryId: cat._id, // "category:main_dish"
    });
    await adapter.put(phoBo);

    const comRang = createProductDoc({
      id: 'com-rang',
      name: { vi: 'Cơm rang dưa bò', en: 'Fried Rice' },
      basePrice: money(55000, 'VND'),
      categoryId: cat._id,
    });
    await adapter.put(comRang);

    const bill: BillDoc = {
      _id: 'bill:dist1:b500',
      branchId: 'dist1',
      sessionId: 's500',
      billNumber: 'B-500',
      paymentRef: 'P-500',
      status: 'paid',
      lines: [
        {
          lineId: 'l1',
          productId: phoBo._id, // "product:pho-bo"
          nameSnapshot: phoBo.name,
          unitPriceSnapshot: money(55000, 'VND'),
          qty: 10,
          status: 'placed',
          addedAt: '2026-10-26T12:00:00.000Z',
          modifiers: [],
        },
        {
          lineId: 'l2',
          productId: comRang._id, // "product:com-rang"
          nameSnapshot: comRang.name,
          unitPriceSnapshot: money(55000, 'VND'),
          qty: 5,
          status: 'placed',
          addedAt: '2026-10-26T12:00:00.000Z',
          modifiers: [],
        },
      ],
      discounts: [],
      surcharges: [],
      taxMode: 'inclusive',
      taxLines: [],
      taxTotal: money(0, 'VND'),
      subtotal: money(825000, 'VND'),
      discountTotal: money(0, 'VND'),
      surchargeTotal: money(0, 'VND'),
      total: money(825000, 'VND'),
      payments: [
        {
          paymentId: 'pay1',
          method: 'cash',
          amount: money(825000, 'VND'),
          tendered: money(825000, 'VND'),
          change: money(0, 'VND'),
          createdAt: '2026-10-26T12:05:00.000Z',
        },
      ],
      balanceRemaining: money(0, 'VND'),
      createdAt: '2026-10-26T12:00:00.000Z',
      updatedAt: '2026-10-26T12:05:00.000Z',
    };
    await adapter.put(bill as unknown as any);

    const report = await generateCategorySalesReport(adapter, 'dist1', {
      startDate: '2026-10-26T00:00:00.000Z',
      endDate: '2026-10-26T23:59:59.000Z',
    });

    expect(report).toHaveLength(1);
    expect(report[0]?.categoryId).toBe('main_dish');
    expect(report[0]?.categoryName).toBe('Món chính');
    expect(report[0]?.quantitySold).toBe(15);
    expect(report[0]?.netRevenue.minor).toBe(825000);
    expect(report[0]?.percentageOfTotal).toBe(100);

    expect(report[0]?.items).toHaveLength(2);
    expect(report[0]?.items?.[0]?.productName).toBe('Phở Bò');
    expect(report[0]?.items?.[0]?.quantitySold).toBe(10);
    expect(report[0]?.items?.[0]?.netRevenue.minor).toBe(550000);
    expect(report[0]?.items?.[0]?.percentageOfCategory).toBe(67);

    expect(report[0]?.items?.[1]?.productName).toBe('Cơm rang dưa bò');
    expect(report[0]?.items?.[1]?.quantitySold).toBe(5);
    expect(report[0]?.items?.[1]?.netRevenue.minor).toBe(275000);
    expect(report[0]?.items?.[1]?.percentageOfCategory).toBe(33);
  });
});
