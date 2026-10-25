import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createBranchRepository } from '../../branch/branch-repository';
import { generateCrossBranchReport } from '../cross-branch';
import { money } from '../../money';
import type { BillDoc } from '../../order/types';
import type { DocEnvelope } from '../../db/envelope';

function makePaidBill(branchId: string, id: string, totalMinor: number): BillDoc & DocEnvelope {
  return {
    _id: `bill:${branchId}:${id}`,
    branchId,
    docType: 'bill',
    schemaVersion: 1,
    sessionId: `session:${branchId}:s1`,
    billNumber: `${branchId}-0001`,
    paymentRef: 'POS1',
    status: 'paid',
    lines: [],
    discounts: [],
    surcharges: [],
    taxMode: 'inclusive',
    taxLines: [],
    taxTotal: money(0, 'VND'),
    subtotal: money(totalMinor, 'VND'),
    discountTotal: money(0, 'VND'),
    surchargeTotal: money(0, 'VND'),
    total: money(totalMinor, 'VND'),
    payments: [],
    balanceRemaining: money(0, 'VND'),
    createdAt: '2026-10-25T10:00:00.000Z',
    updatedAt: '2026-10-25T10:00:00.000Z',
    paidAt: '2026-10-25T10:00:00.000Z',
  };
}

describe('generateCrossBranchReport', () => {
  it('aggregates revenue and bill counts across multiple branches for owner', async () => {
    const adapter = await createMemoryAdapter();
    const branchRepo = createBranchRepository(adapter);
    await branchRepo.createBranch({ code: 'HQ', name: 'Trụ sở' });
    await branchRepo.createBranch({ code: 'D1', name: 'Quận 1' });

    await adapter.put(makePaidBill('hq', 'b1', 100000));
    await adapter.put(makePaidBill('hq', 'b2', 50000));
    await adapter.put(makePaidBill('d1', 'b3', 200000));

    const report = await generateCrossBranchReport(adapter, branchRepo, {
      actorRole: 'owner',
    });

    expect(report.totalOrders).toBe(3);
    expect(report.consolidatedRevenue.minor).toBe(350000);
    expect(report.branches).toHaveLength(2);

    const hqSummary = report.branches.find((b) => b.branchId === 'hq');
    expect(hqSummary?.totalRevenue.minor).toBe(150000);
    expect(hqSummary?.paidBillsCount).toBe(2);

    const d1Summary = report.branches.find((b) => b.branchId === 'd1');
    expect(d1Summary?.totalRevenue.minor).toBe(200000);
    expect(d1Summary?.paidBillsCount).toBe(1);
  });

  it('Review Focus 3: throws UnauthorizedError when non-owner requests cross-branch report', async () => {
    const adapter = await createMemoryAdapter();
    const branchRepo = createBranchRepository(adapter);

    await expect(
      generateCrossBranchReport(adapter, branchRepo, { actorRole: 'cashier' }),
    ).rejects.toThrow('Unauthorized: only owner can generate cross-branch report');
  });
});
