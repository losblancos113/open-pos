import type { CategorySalesReport, HourlySalesReport, ZReportSummary } from './store-reports';

function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportZReportToCsv(report: ZReportSummary): string {
  const rows: Array<[string, string | number]> = [
    ['Metric', 'Value'],
    ['Branch ID', report.branchId],
    ['Period Start', report.periodStart],
    ['Period End', report.periodEnd],
    ['Total Bills', report.totalBills],
    ['Paid Bills', report.paidBills],
    ['Voided Bills', report.voidedBills],
    ['Gross Sales', report.grossSales.minor],
    ['Discounts', report.discountTotal.minor],
    ['Surcharges', report.surchargeTotal.minor],
    ['Taxes', report.taxTotal.minor],
    ['Net Sales', report.netSales.minor],
  ];

  if (report.shiftId) {
    rows.push(['Shift ID', report.shiftId]);
  }

  // Payment methods breakdown
  for (const [method, total] of Object.entries(report.paymentsByMethod)) {
    rows.push([`Payment: ${method}`, total.minor]);
  }

  // Cash drawer breakdown
  rows.push(['Opening Cash', report.openingCash.minor]);
  rows.push(['Cash Sales', report.cashSales.minor]);
  rows.push(['Cash In', report.cashIn.minor]);
  rows.push(['Cash Drops', report.cashDrops.minor]);
  rows.push(['Expected Cash', report.expectedCash.minor]);

  if (report.countedCash) {
    rows.push(['Counted Cash', report.countedCash.minor]);
  }
  if (report.variance) {
    rows.push(['Variance', report.variance.minor]);
  }

  return rows.map(([col1, col2]) => `${escapeCsv(col1)},${escapeCsv(col2)}`).join('\n');
}

export function exportCategoryReportToCsv(categories: readonly CategorySalesReport[]): string {
  const lines: string[] = [
    'Category ID,Category Name,Quantity Sold,Net Revenue,Share (%)',
  ];

  for (const cat of categories) {
    lines.push(
      [
        escapeCsv(cat.categoryId),
        escapeCsv(cat.categoryName),
        cat.quantitySold,
        cat.netRevenue.minor,
        `${cat.percentageOfTotal}%`,
      ].join(','),
    );
  }

  return lines.join('\n');
}

export function exportHourlyReportToCsv(hourly: readonly HourlySalesReport[]): string {
  const lines: string[] = ['Hour,Order Count,Net Revenue'];

  for (const slot of hourly) {
    const pad = (n: number) => String(n).padStart(2, '0');
    const label = `${pad(slot.hour)}:00 - ${pad(slot.hour)}:59`;
    lines.push([escapeCsv(label), slot.orderCount, slot.netRevenue.minor].join(','));
  }

  return lines.join('\n');
}
