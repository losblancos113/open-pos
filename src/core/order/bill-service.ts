import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { SCHEMA_VERSION } from '../db/envelope';
import { billDocId } from '../db/ids';
import type { BillDoc, PaymentMethod } from './types';

export interface BillFilterOptions {
  startDate?: string | undefined;
  endDate?: string | undefined;
  status?: 'all' | 'draft' | 'placed' | 'paid' | 'voided' | undefined;
  paymentMethod?: 'all' | PaymentMethod | undefined;
  query?: string | undefined;
  sortBy?: 'newest' | 'oldest' | 'highestAmount' | undefined;
}

export interface VoidBillOptions {
  reason: string;
  actorId: string;
  actorName?: string | undefined;
  clock?: (() => string) | undefined;
}

export interface UpdateBillNoteOptions {
  actorId?: string | undefined;
  actorName?: string | undefined;
  clock?: (() => string) | undefined;
}

/**
 * Normalizes bill ID to document ID format `bill:<branchId>:<uuid>`.
 */
export function normalizeBillDocId(branchId: string, billId: string): string {
  if (billId.startsWith('bill:')) {
    return billId;
  }
  return billDocId(branchId, billId);
}

/**
 * Checks if a user role has authority to modify or void invoices.
 * Only owner and manager (branch admin) roles have this privilege.
 */
export function canEditBill(role?: string | null): boolean {
  return role === 'owner' || role === 'manager';
}

/**
 * Queries and filters invoices for a given branch.
 */
export async function listBills(
  adapter: DbAdapter,
  branchId: string,
  filter?: BillFilterOptions,
): Promise<BillDoc[]> {
  const allDocs = await adapter.allDocs({ branchId });

  const bills = allDocs.filter((doc) => {
    const isBill =
      doc._id.startsWith('bill:') ||
      (doc as unknown as { docType?: string }).docType === 'bill';
    if (!isBill || doc.deletedAt) {
      return false;
    }
    const b = doc as unknown as BillDoc;
    if (branchId !== '*' && b.branchId !== branchId) {
      return false;
    }

    const time = b.paidAt || b.createdAt;
    if (filter?.startDate && time < filter.startDate) {
      return false;
    }
    if (filter?.endDate && time > filter.endDate) {
      return false;
    }

    if (filter?.status && filter.status !== 'all' && b.status !== filter.status) {
      return false;
    }

    if (filter?.paymentMethod && filter.paymentMethod !== 'all') {
      const hasMethod = b.payments?.some((p) => p.method === filter.paymentMethod);
      if (!hasMethod) {
        return false;
      }
    }

    if (filter?.query && filter.query.trim() !== '') {
      const q = filter.query.trim().toLowerCase();
      const matchNumber = b.billNumber?.toLowerCase().includes(q);
      const matchRef = b.paymentRef?.toLowerCase().includes(q);
      const matchTable = b.tableNameSnapshot?.toLowerCase().includes(q);
      const matchNote = b.note?.toLowerCase().includes(q);
      const matchVoid = b.voidReason?.toLowerCase().includes(q);
      const matchLines = b.lines?.some(
        (l) =>
          l.nameSnapshot?.vi?.toLowerCase().includes(q) ||
          l.nameSnapshot?.en?.toLowerCase().includes(q),
      );

      if (
        !matchNumber &&
        !matchRef &&
        !matchTable &&
        !matchNote &&
        !matchVoid &&
        !matchLines
      ) {
        return false;
      }
    }

    return true;
  }) as unknown as BillDoc[];

  const sortBy = filter?.sortBy ?? 'newest';
  return bills.sort((a, b) => {
    if (sortBy === 'oldest') {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    }
    if (sortBy === 'highestAmount') {
      return b.total.minor - a.total.minor;
    }
    // 'newest' default
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

/**
 * Retrieves a single bill by ID.
 */
export async function getBill(
  adapter: DbAdapter,
  branchId: string,
  billId: string,
): Promise<BillDoc | null> {
  const docId = normalizeBillDocId(branchId, billId);
  const doc = await adapter.get(docId);
  if (!doc || doc.deletedAt) {
    return null;
  }
  return doc as unknown as BillDoc;
}

/**
 * Voids an invoice with a mandatory reason and records audit metadata.
 */
export async function voidBill(
  adapter: DbAdapter,
  branchId: string,
  billId: string,
  options: VoidBillOptions,
): Promise<BillDoc> {
  if (!options.reason || options.reason.trim() === '') {
    throw new Error('voidBill(): reason is required');
  }
  if (!options.actorId || options.actorId.trim() === '') {
    throw new Error('voidBill(): actorId is required');
  }

  const docId = normalizeBillDocId(branchId, billId);
  const existing = await adapter.get(docId);
  if (!existing || existing.deletedAt) {
    throw new Error(`voidBill(): bill ${docId} not found`);
  }

  const bill = existing as unknown as BillDoc;
  if (bill.status === 'voided') {
    throw new Error(`voidBill(): bill ${docId} is already voided`);
  }

  const now = options.clock ? options.clock() : new Date().toISOString();

  const updatedBill: BillDoc = {
    ...bill,
    docType: 'bill',
    schemaVersion: SCHEMA_VERSION,
    status: 'voided',
    voidReason: options.reason.trim(),
    voidedAt: now,
    voidedBy: options.actorName || options.actorId,
    updatedAt: now,
    ...(existing._rev ? { _rev: existing._rev } : {}),
  } as unknown as BillDoc;

  await adapter.put(updatedBill as unknown as DocEnvelope);
  return updatedBill;
}

/**
 * Updates the note of an invoice.
 */
export async function updateBillNote(
  adapter: DbAdapter,
  branchId: string,
  billId: string,
  note: string,
  options?: UpdateBillNoteOptions,
): Promise<BillDoc> {
  const docId = normalizeBillDocId(branchId, billId);
  const existing = await adapter.get(docId);
  if (!existing || existing.deletedAt) {
    throw new Error(`updateBillNote(): bill ${docId} not found`);
  }

  const bill = existing as unknown as BillDoc;
  const now = options?.clock ? options.clock() : new Date().toISOString();

  const updatedBill: BillDoc = {
    ...bill,
    docType: 'bill',
    schemaVersion: SCHEMA_VERSION,
    note: note.trim(),
    updatedAt: now,
    ...(existing._rev ? { _rev: existing._rev } : {}),
  } as unknown as BillDoc;

  await adapter.put(updatedBill as unknown as DocEnvelope);
  return updatedBill;
}
