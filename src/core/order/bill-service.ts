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

  // 1. Build table lookup map: maps various forms of table ID/code to human-readable table name
  const tableMap = new Map<string, string>();
  for (const doc of allDocs) {
    const isTable =
      doc._id.startsWith('table:') ||
      (doc as unknown as { docType?: string }).docType === 'table';
    if (isTable && !doc.deletedAt) {
      const tDoc = doc as unknown as {
        _id: string;
        name?: string;
        code?: string;
      };
      const displayName = tDoc.name || tDoc.code || tDoc._id;
      tableMap.set(tDoc._id, displayName);
      const cleanId = tDoc._id.replace(/^table:[^:]+:/, '');
      tableMap.set(cleanId, displayName);
      if (tDoc.code) {
        tableMap.set(tDoc.code, displayName);
      }
    }
  }

  // 2. Build session-to-table map and bill-to-table map from sessions and session_events
  const sessionTableMap = new Map<string, string>();
  const billTableMap = new Map<string, string>();

  for (const doc of allDocs) {
    if (doc.deletedAt) continue;

    let tableIds: string[] = [];
    let billIds: string[] = [];
    let cleanSessId = '';

    if (
      doc._id.startsWith('session_events:') ||
      doc._id.startsWith('events:') ||
      (doc as unknown as { docType?: string }).docType === 'session_events'
    ) {
      const evDoc = doc as unknown as {
        sessionId?: string;
        snapshot?: { session?: { tableIds?: string[]; billIds?: string[] } };
        events?: Array<{ type?: string; payload?: { tableIds?: string[]; tableName?: string; tableNameSnapshot?: string } }>;
      };
      cleanSessId =
        evDoc.sessionId ||
        doc._id.replace(/^(?:session_events|events):[^:]+:/, '');

      if (evDoc.snapshot?.session?.tableIds && evDoc.snapshot.session.tableIds.length > 0) {
        tableIds = evDoc.snapshot.session.tableIds;
      }
      if (evDoc.snapshot?.session?.billIds) {
        billIds = evDoc.snapshot.session.billIds;
      }

      // Check events if snapshot didn't have tableIds
      if (tableIds.length === 0 && Array.isArray(evDoc.events)) {
        for (const ev of evDoc.events) {
          if (ev.payload?.tableIds && Array.isArray(ev.payload.tableIds) && ev.payload.tableIds.length > 0) {
            tableIds = ev.payload.tableIds;
            break;
          }
        }
      }
    } else if (
      doc._id.startsWith('session:') ||
      (doc as unknown as { docType?: string }).docType === 'session'
    ) {
      const sDoc = doc as unknown as {
        _id: string;
        tableIds?: string[];
        billIds?: string[];
      };
      cleanSessId = sDoc._id.replace(/^session:[^:]+:/, '');
      if (sDoc.tableIds && sDoc.tableIds.length > 0) {
        tableIds = sDoc.tableIds;
      }
      if (sDoc.billIds) {
        billIds = sDoc.billIds;
      }
    }

    if (tableIds.length > 0 && cleanSessId) {
      const names = tableIds
        .map((tid) => {
          const clean = tid.replace(/^table:[^:]+:/, '');
          return tableMap.get(tid) || tableMap.get(clean) || clean;
        })
        .filter(Boolean);

      if (names.length > 0) {
        const tableLabel = names.join(', ');
        sessionTableMap.set(cleanSessId, tableLabel);
        sessionTableMap.set(`session:${branchId}:${cleanSessId}`, tableLabel);

        for (const bid of billIds) {
          const cleanBid = bid.replace(/^bill:[^:]+:/, '');
          billTableMap.set(bid, tableLabel);
          billTableMap.set(cleanBid, tableLabel);
          billTableMap.set(`bill:${branchId}:${cleanBid}`, tableLabel);
        }
      }
    }
  }

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

    // Auto-resolve tableNameSnapshot from table/session maps if not present
    if (!b.tableNameSnapshot || b.tableNameSnapshot.trim() === '') {
      const cleanSess = (b.sessionId || '').replace(/^session:[^:]+:/, '');
      const cleanBId = b._id.replace(/^bill:[^:]+:/, '');
      const rawTableId = (b as unknown as Record<string, unknown>).tableId as string | undefined;
      const cleanTableId = rawTableId ? rawTableId.replace(/^table:[^:]+:/, '') : '';
      const resolved =
        billTableMap.get(b._id) ||
        billTableMap.get(cleanBId) ||
        sessionTableMap.get(b.sessionId) ||
        sessionTableMap.get(cleanSess) ||
        (rawTableId ? (tableMap.get(rawTableId) || tableMap.get(cleanTableId)) : undefined);

      if (resolved) {
        b.tableNameSnapshot = resolved;
      }
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
  const bill = { ...doc } as unknown as BillDoc;
  if (!bill.tableNameSnapshot || bill.tableNameSnapshot.trim() === '') {
    if (bill.sessionId) {
      const cleanSess = bill.sessionId.replace(/^session:[^:]+:/, '');
      const sDoc =
        (await adapter.get(`session:${branchId}:${cleanSess}`)) ||
        (await adapter.get(bill.sessionId));
      const s = sDoc as unknown as { tableIds?: string[] } | null;
      if (s?.tableIds && s.tableIds.length > 0) {
        const names: string[] = [];
        for (const tid of s.tableIds) {
          const cleanTid = tid.replace(/^table:[^:]+:/, '');
          const tDoc =
            (await adapter.get(`table:${branchId}:${cleanTid}`)) ||
            (await adapter.get(tid));
          if (tDoc) {
            const rawT = tDoc as unknown as { name?: string; code?: string };
            names.push(rawT.name || rawT.code || cleanTid);
          } else {
            names.push(cleanTid);
          }
        }
        if (names.length > 0) {
          bill.tableNameSnapshot = names.join(', ');
        }
      }
    }
  }
  return bill;
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
