import type { DbAdapter } from '../db/adapter';
import { shiftDocId } from '../db/ids';
import { add, money, sub, type Money } from '../money';
import type { BillDoc } from '../order/types';
import type { ShiftCashMovementDoc, ShiftDoc } from '../shift/types';

export interface ZReportSummary {
  readonly branchId: string;
  readonly shiftId?: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly totalBills: number;
  readonly paidBills: number;
  readonly voidedBills: number;
  readonly grossSales: Money;
  readonly discountTotal: Money;
  readonly surchargeTotal: Money;
  readonly taxTotal: Money;
  readonly netSales: Money;
  readonly paymentsByMethod: Record<string, Money>;
  readonly openingCash: Money;
  readonly cashSales: Money;
  readonly cashIn: Money;
  readonly cashDrops: Money;
  readonly expectedCash: Money;
  readonly countedCash?: Money;
  readonly variance?: Money;
}

export interface CategoryItemSalesReport {
  readonly productId: string;
  readonly productName: string;
  readonly quantitySold: number;
  readonly netRevenue: Money;
  readonly percentageOfCategory: number;
}

export interface CategorySalesReport {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly quantitySold: number;
  readonly netRevenue: Money;
  readonly percentageOfTotal: number;
  readonly items?: readonly CategoryItemSalesReport[];
}

export interface HourlySalesReport {
  readonly hour: number; // 0..23
  readonly orderCount: number;
  readonly netRevenue: Money;
}

export interface ReportDateRangeOptions {
  shiftId?: string;
  startDate?: string;
  endDate?: string;
}

export async function generateZReport(
  adapter: DbAdapter,
  branchId: string,
  options: ReportDateRangeOptions,
): Promise<ZReportSummary> {
  const currency = 'VND';
  let shift: ShiftDoc | null = null;
  let periodStart = options.startDate || '1970-01-01T00:00:00.000Z';
  let periodEnd = options.endDate || new Date().toISOString();
  let openingCash = money(0, currency);
  let countedCash: Money | undefined = undefined;
  let variance: Money | undefined = undefined;

  if (options.shiftId) {
    const rawShift = await adapter.get(shiftDocId(branchId, options.shiftId));
    if (rawShift && !rawShift.deletedAt) {
      shift = rawShift as unknown as ShiftDoc;
      periodStart = shift.openedAt;
      periodEnd = shift.closedAt || new Date().toISOString();
      openingCash = shift.openingCash;
      countedCash = shift.countedCash;
      variance = shift.variance;
    }
  }

  // Load all documents for branch
  const allDocs = await adapter.allDocs({ branchId });

  // 1. Shift cash movements
  let cashIn = money(0, currency);
  let cashDrops = money(0, currency);

  const cashMovements = allDocs.filter((doc) => {
    const m = doc as unknown as ShiftCashMovementDoc;
    return (
      m.docType === 'shift_cash_movement' &&
      m.branchId === branchId &&
      (!options.shiftId || m.shiftId === options.shiftId) &&
      m.createdAt >= periodStart &&
      m.createdAt <= periodEnd &&
      !doc.deletedAt
    );
  }) as unknown as ShiftCashMovementDoc[];

  for (const m of cashMovements) {
    if (m.type === 'cash_in') {
      cashIn = add(cashIn, m.amount);
    } else if (m.type === 'cash_drop') {
      cashDrops = add(cashDrops, m.amount);
    }
  }

  // 2. Bills
  const bills = allDocs.filter((doc) => {
    const b = doc as unknown as BillDoc;
    const isBill = doc._id.startsWith('bill:') || (doc as unknown as { docType?: string }).docType === 'bill';
    return (
      isBill &&
      b.branchId === branchId &&
      b.createdAt >= periodStart &&
      b.createdAt <= periodEnd &&
      !doc.deletedAt
    );
  }) as unknown as BillDoc[];

  let totalBills = 0;
  let paidBills = 0;
  let voidedBills = 0;
  let grossSales = money(0, currency);
  let discountTotal = money(0, currency);
  let surchargeTotal = money(0, currency);
  let taxTotal = money(0, currency);
  let netSales = money(0, currency);
  const paymentsByMethod: Record<string, Money> = {};

  for (const bill of bills) {
    totalBills++;
    if (bill.status === 'voided') {
      voidedBills++;
      continue;
    }

    if (bill.status === 'paid') {
      paidBills++;
      grossSales = add(grossSales, bill.subtotal);
      discountTotal = add(discountTotal, bill.discountTotal);
      surchargeTotal = add(surchargeTotal, bill.surchargeTotal);
      taxTotal = add(taxTotal, bill.taxTotal);
      netSales = add(netSales, bill.total);

      for (const p of bill.payments) {
        const method = p.method || 'other';
        paymentsByMethod[method] = add(paymentsByMethod[method] || money(0, currency), p.amount);
      }
    }
  }

  const cashSales = paymentsByMethod['cash'] || money(0, currency);
  // expectedCash = openingCash + cashSales + cashIn - cashDrops
  const expectedCash = sub(add(add(openingCash, cashSales), cashIn), cashDrops);

  return {
    branchId,
    ...(options.shiftId ? { shiftId: options.shiftId } : {}),
    periodStart,
    periodEnd,
    totalBills,
    paidBills,
    voidedBills,
    grossSales,
    discountTotal,
    surchargeTotal,
    taxTotal,
    netSales,
    paymentsByMethod,
    openingCash,
    cashSales,
    cashIn,
    cashDrops,
    expectedCash,
    ...(countedCash ? { countedCash } : {}),
    ...(variance ? { variance } : {}),
  };
}

export async function generateCategorySalesReport(
  adapter: DbAdapter,
  branchId: string,
  options: { startDate?: string; endDate?: string } = {},
): Promise<CategorySalesReport[]> {
  const currency = 'VND';
  const periodStart = options.startDate || '1970-01-01T00:00:00.000Z';
  const periodEnd = options.endDate || new Date().toISOString();

  // Load products and categories from DB
  const allDocs = await adapter.allDocs({ includeGlobal: true });

  const categoryMap = new Map<string, string>();
  for (const doc of allDocs) {
    const raw = doc as unknown as Record<string, unknown>;
    const isCat = raw.docType === 'catalog_category' || doc._id.startsWith('category:');
    if (isCat && !doc.deletedAt) {
      const nameObj = raw.name as { vi?: string; en?: string } | string | undefined;
      const catName =
        (typeof nameObj === 'object' && nameObj !== null ? (nameObj.vi || nameObj.en) : '') ||
        (typeof nameObj === 'string' ? nameObj : '') ||
        (typeof raw.categoryId === 'string' ? raw.categoryId : '') ||
        doc._id.replace(/^category:/, '');

      // Index under all variations: _id, stripped _id, categoryId property, id property
      categoryMap.set(doc._id, catName);
      categoryMap.set(doc._id.replace(/^category:/, ''), catName);
      if (typeof raw.categoryId === 'string') {
        categoryMap.set(raw.categoryId, catName);
        categoryMap.set(`category:${raw.categoryId}`, catName);
      }
      if (typeof raw.id === 'string') {
        categoryMap.set(raw.id, catName);
        categoryMap.set(`category:${raw.id}`, catName);
      }
    }
  }

  const productCategoryMap = new Map<string, string>();
  const productCategoryByNameMap = new Map<string, string>();
  const productNameMap = new Map<string, string>();

  for (const doc of allDocs) {
    const raw = doc as unknown as Record<string, unknown>;
    const isProd = raw.docType === 'catalog_product' || doc._id.startsWith('product:');
    if (isProd && !doc.deletedAt) {
      const catId =
        (raw.categoryId as string | undefined | null) ||
        (raw.category_id as string | undefined | null) ||
        null;
      const nameObj = raw.name as { vi?: string; en?: string } | string | undefined;
      const prodName =
        (typeof nameObj === 'object' && nameObj !== null ? (nameObj.vi || nameObj.en) : '') ||
        (typeof nameObj === 'string' ? nameObj : '') ||
        doc._id.replace(/^product:/, '');

      // Index product name
      productNameMap.set(doc._id, prodName);
      productNameMap.set(doc._id.replace(/^product:/, ''), prodName);
      if (typeof raw.productId === 'string') {
        productNameMap.set(raw.productId, prodName);
        productNameMap.set(`product:${raw.productId}`, prodName);
      }
      if (typeof raw.id === 'string') {
        productNameMap.set(raw.id, prodName);
        productNameMap.set(`product:${raw.id}`, prodName);
      }

      // Index product category
      if (catId) {
        productCategoryMap.set(doc._id, catId);
        productCategoryMap.set(doc._id.replace(/^product:/, ''), catId);
        if (typeof raw.productId === 'string') {
          productCategoryMap.set(raw.productId, catId);
          productCategoryMap.set(`product:${raw.productId}`, catId);
        }
        if (typeof raw.id === 'string') {
          productCategoryMap.set(raw.id, catId);
          productCategoryMap.set(`product:${raw.id}`, catId);
        }

        // Also map by localized names for fallback
        if (typeof nameObj === 'object' && nameObj !== null) {
          if (nameObj.vi) productCategoryByNameMap.set(nameObj.vi.trim().toLowerCase(), catId);
          if (nameObj.en) productCategoryByNameMap.set(nameObj.en.trim().toLowerCase(), catId);
        } else if (typeof nameObj === 'string' && nameObj.trim()) {
          productCategoryByNameMap.set(nameObj.trim().toLowerCase(), catId);
        }
      }
    }
  }

  const branchDocs = await adapter.allDocs({ branchId });
  const paidBills = branchDocs.filter((doc) => {
    const b = doc as unknown as BillDoc;
    const isBill = doc._id.startsWith('bill:') || (doc as unknown as { docType?: string }).docType === 'bill';
    return (
      isBill &&
      b.branchId === branchId &&
      b.status === 'paid' &&
      b.createdAt >= periodStart &&
      b.createdAt <= periodEnd &&
      !doc.deletedAt
    );
  }) as unknown as BillDoc[];

  const categoryStats = new Map<
    string,
    {
      qty: number;
      revenue: Money;
      itemStats: Map<string, { name: string; qty: number; revenue: Money }>;
    }
  >();

  for (const bill of paidBills) {
    for (const line of bill.lines) {
      if (line.status === 'voided') continue;

      // 1. Try productId variations
      let rawCatId =
        productCategoryMap.get(line.productId) ||
        productCategoryMap.get(line.productId.replace(/^product:/, '')) ||
        productCategoryMap.get(`product:${line.productId}`) ||
        ((line as unknown as Record<string, unknown>).categoryId as string | undefined);

      // 2. Try product name fallback
      if (!rawCatId) {
        const lineNameVi = line.nameSnapshot?.vi?.trim().toLowerCase();
        const lineNameEn = line.nameSnapshot?.en?.trim().toLowerCase();
        if (lineNameVi && productCategoryByNameMap.has(lineNameVi)) {
          rawCatId = productCategoryByNameMap.get(lineNameVi);
        } else if (lineNameEn && productCategoryByNameMap.has(lineNameEn)) {
          rawCatId = productCategoryByNameMap.get(lineNameEn);
        }
      }

      const catId = rawCatId || 'uncategorized';
      const normalizedCatId =
        catId === 'uncategorized' ? 'uncategorized' : catId.replace(/^category:/, '');

      const existing = categoryStats.get(normalizedCatId) || {
        qty: 0,
        revenue: money(0, currency),
        itemStats: new Map(),
      };
      existing.qty += line.qty;

      // Line revenue: unitPriceSnapshot * qty
      const lineRevenue = money(line.unitPriceSnapshot.minor * line.qty, currency);
      existing.revenue = add(existing.revenue, lineRevenue);

      // Track item
      const itemName =
        line.nameSnapshot?.vi ||
        line.nameSnapshot?.en ||
        productNameMap.get(line.productId) ||
        line.productId.replace(/^product:/, '');
      const itemExisting = existing.itemStats.get(line.productId) || {
        name: itemName,
        qty: 0,
        revenue: money(0, currency),
      };
      itemExisting.qty += line.qty;
      itemExisting.revenue = add(itemExisting.revenue, lineRevenue);
      existing.itemStats.set(line.productId, itemExisting);

      categoryStats.set(normalizedCatId, existing);
    }
  }

  let totalRevenueMinor = 0;
  for (const stat of categoryStats.values()) {
    totalRevenueMinor += stat.revenue.minor;
  }

  const results: CategorySalesReport[] = [];
  for (const [catId, stat] of categoryStats.entries()) {
    const catName =
      categoryMap.get(catId) ||
      categoryMap.get(`category:${catId}`) ||
      (catId === 'uncategorized' ? 'Chưa phân loại' : catId);
    const percentageOfTotal =
      totalRevenueMinor > 0 ? Math.round((stat.revenue.minor / totalRevenueMinor) * 100) : 0;

    const items: CategoryItemSalesReport[] = [];
    const catTotalMinor = stat.revenue.minor;
    for (const [prodId, iStat] of stat.itemStats.entries()) {
      const percentageOfCategory =
        catTotalMinor > 0 ? Math.round((iStat.revenue.minor / catTotalMinor) * 100) : 0;
      items.push({
        productId: prodId,
        productName: iStat.name,
        quantitySold: iStat.qty,
        netRevenue: iStat.revenue,
        percentageOfCategory,
      });
    }
    items.sort((a, b) => b.netRevenue.minor - a.netRevenue.minor);

    results.push({
      categoryId: catId,
      categoryName: catName,
      quantitySold: stat.qty,
      netRevenue: stat.revenue,
      percentageOfTotal,
      items,
    });
  }

  return results.sort((a, b) => b.netRevenue.minor - a.netRevenue.minor);
}

export async function generateHourlySalesReport(
  adapter: DbAdapter,
  branchId: string,
  options: { startDate?: string; endDate?: string } = {},
): Promise<HourlySalesReport[]> {
  const currency = 'VND';
  const periodStart = options.startDate || '1970-01-01T00:00:00.000Z';
  const periodEnd = options.endDate || new Date().toISOString();

  // Initialize 24 slots (0..23)
  const hourlySlots: Array<{ count: number; revenue: Money }> = Array.from({ length: 24 }, () => ({
    count: 0,
    revenue: money(0, currency),
  }));

  const branchDocs = await adapter.allDocs({ branchId });
  const paidBills = branchDocs.filter((doc) => {
    const b = doc as unknown as BillDoc;
    const isBill = doc._id.startsWith('bill:') || (doc as unknown as { docType?: string }).docType === 'bill';
    return (
      isBill &&
      b.branchId === branchId &&
      b.status === 'paid' &&
      b.createdAt >= periodStart &&
      b.createdAt <= periodEnd &&
      !doc.deletedAt
    );
  }) as unknown as BillDoc[];

  for (const bill of paidBills) {
    const hour = new Date(bill.createdAt).getUTCHours();
    if (hour >= 0 && hour < 24) {
      const slot = hourlySlots[hour];
      if (slot) {
        slot.count += 1;
        slot.revenue = add(slot.revenue, bill.total);
      }
    }
  }

  return hourlySlots.map((slot, hour) => ({
    hour,
    orderCount: slot.count,
    netRevenue: slot.revenue,
  }));
}
