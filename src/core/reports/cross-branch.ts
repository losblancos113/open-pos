import type { DbAdapter } from '../db/adapter';
import type { BranchRepository } from '../branch/branch-repository';
import type { UserRole } from '../auth/types';
import type { BillDoc } from '../order/types';
import { money, add, type Money } from '../money';

export interface BranchSummaryReport {
  branchId: string;
  branchName: string;
  branchCode: string;
  totalOrders: number;
  totalRevenue: Money;
  paidBillsCount: number;
}

export interface CrossBranchReport {
  branches: BranchSummaryReport[];
  consolidatedRevenue: Money;
  totalOrders: number;
  generatedAt: string;
}

export interface GenerateReportOptions {
  actorRole?: UserRole;
  dateRange?: { start?: string; end?: string };
  now?: string;
}

export async function generateCrossBranchReport(
  adapter: DbAdapter,
  branchRepo: BranchRepository,
  options: GenerateReportOptions = {},
): Promise<CrossBranchReport> {
  if (options.actorRole !== 'owner') {
    throw new Error('Unauthorized: only owner can generate cross-branch report');
  }

  const timestamp = options.now ?? new Date().toISOString();
  const branches = await branchRepo.listBranches({ includeInactive: true });
  const allDocs = await adapter.allDocs();

  const paidBills: BillDoc[] = [];
  for (const doc of allDocs) {
    if (doc.deletedAt !== undefined) continue;
    if (doc._id.startsWith('bill:') || (doc as any).docType === 'bill') {
      const b = doc as unknown as BillDoc;
      if (b.status !== 'paid') continue;
      const paidTime = b.paidAt ?? b.createdAt;
      if (options.dateRange?.start && paidTime < options.dateRange.start) continue;
      if (options.dateRange?.end && paidTime > options.dateRange.end) continue;
      paidBills.push(b);
    }
  }

  const branchSummaries: BranchSummaryReport[] = [];
  let consolidated = money(0, 'VND');
  let totalOrderCount = 0;

  for (const branch of branches) {
    const branchKey = branch.code.toLowerCase();
    const branchBills = paidBills.filter(
      (b) => b.branchId === branchKey || b.branchId === branch._id.replace('branch:', ''),
    );

    let branchRevenue = money(0, 'VND');
    for (const bill of branchBills) {
      branchRevenue = add(branchRevenue, bill.total);
    }

    consolidated = add(consolidated, branchRevenue);
    totalOrderCount += branchBills.length;

    branchSummaries.push({
      branchId: branchKey,
      branchName: branch.name,
      branchCode: branch.code,
      totalOrders: branchBills.length,
      totalRevenue: branchRevenue,
      paidBillsCount: branchBills.length,
    });
  }

  return {
    branches: branchSummaries,
    consolidatedRevenue: consolidated,
    totalOrders: totalOrderCount,
    generatedAt: timestamp,
  };
}
