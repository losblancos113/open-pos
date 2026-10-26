import { describe, it, expect } from 'vitest';
import {
  exportZReportToCsv,
  exportCategoryReportToCsv,
  exportHourlyReportToCsv,
} from '../export';
import { money } from '../../money';
import type { ZReportSummary, CategorySalesReport, HourlySalesReport } from '../store-reports';

describe('Report CSV Export Utilities', () => {
  it('formats Z-Report to CSV with headers, financial figures, and payment breakdowns', () => {
    const report: ZReportSummary = {
      branchId: 'hq',
      shiftId: 'sh_01',
      periodStart: '2026-10-26T08:00:00.000Z',
      periodEnd: '2026-10-26T17:00:00.000Z',
      totalBills: 15,
      paidBills: 14,
      voidedBills: 1,
      grossSales: money(1500000, 'VND'),
      discountTotal: money(50000, 'VND'),
      surchargeTotal: money(20000, 'VND'),
      taxTotal: money(10000, 'VND'),
      netSales: money(1480000, 'VND'),
      paymentsByMethod: {
        cash: money(880000, 'VND'),
        bank_transfer: money(600000, 'VND'),
      },
      openingCash: money(500000, 'VND'),
      cashSales: money(880000, 'VND'),
      cashIn: money(100000, 'VND'),
      cashDrops: money(200000, 'VND'),
      expectedCash: money(1280000, 'VND'),
      countedCash: money(1280000, 'VND'),
      variance: money(0, 'VND'),
    };

    const csv = exportZReportToCsv(report);

    expect(csv).toContain('Metric,Value');
    expect(csv).toContain('Branch ID,hq');
    expect(csv).toContain('Gross Sales,1500000');
    expect(csv).toContain('Net Sales,1480000');
    expect(csv).toContain('Payment: cash,880000');
    expect(csv).toContain('Payment: bank_transfer,600000');
    expect(csv).toContain('Expected Cash,1280000');
    expect(csv).toContain('Counted Cash,1280000');
    expect(csv).toContain('Variance,0');
  });

  it('formats Category Sales Report to CSV', () => {
    const categories: CategorySalesReport[] = [
      {
        categoryId: 'cat_coffee',
        categoryName: 'Cà phê',
        quantitySold: 45,
        netRevenue: money(1350000, 'VND'),
        percentageOfTotal: 65,
      },
      {
        categoryId: 'cat_tea',
        categoryName: 'Trà trái cây',
        quantitySold: 20,
        netRevenue: money(720000, 'VND'),
        percentageOfTotal: 35,
      },
    ];

    const csv = exportCategoryReportToCsv(categories);

    expect(csv).toContain('Category ID,Category Name,Quantity Sold,Net Revenue,Share (%)');
    expect(csv).toContain('cat_coffee,Cà phê,45,1350000,65%');
    expect(csv).toContain('cat_tea,Trà trái cây,20,720000,35%');
  });

  it('formats Hourly Sales Report to CSV', () => {
    const hourly: HourlySalesReport[] = [
      { hour: 8, orderCount: 5, netRevenue: money(250000, 'VND') },
      { hour: 9, orderCount: 12, netRevenue: money(600000, 'VND') },
    ];

    const csv = exportHourlyReportToCsv(hourly);

    expect(csv).toContain('Hour,Order Count,Net Revenue');
    expect(csv).toContain('08:00 - 08:59,5,250000');
    expect(csv).toContain('09:00 - 09:59,12,600000');
  });
});
