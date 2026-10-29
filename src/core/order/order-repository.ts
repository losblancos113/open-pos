import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { SCHEMA_VERSION } from '../db/envelope';
import {
  billDocId,
  sessionDocId,
  sessionEventsDocId,
  tableDocId,
  areaDocId,
  bankAccountDocId,
  counterDocId,
} from '../db/ids';
import { money } from '../money';
import { createInitialOrderState, reduceOrderEvents } from './reducer';
import {
  splitByItems, splitEvenly, splitBySeat, mergeBills, transferTable, moveLines,
  type SplitByItemsResult, type SplitEvenlyResult, type SplitBySeatResult,
  type MergeBillsResult, type TransferTableResult, type MoveLinesResult,
} from './split-merge';
import type {
  SessionDoc,
  BillDoc,
  AreaDoc,
  TableDoc,
  OrderAggregateState,
  KdsLineStatus,
} from './types';
import type { OrderEventDoc, SessionEventsDoc } from './events';
import type { BankAccountDoc } from '../qr/bank-account';
import type { BillingSettingsDoc } from './billing-settings';
import {
  getBillingSettings as fetchBillingSettings,
  saveBillingSettings as persistBillingSettings,
} from './billing-settings';
import type { InventoryRepository } from '../inventory/inventory-repository';
import { createMovementDoc } from '../inventory/movements';
import { resolveBillDeductions } from '../inventory/deduction';

export interface CreateOrderRepositoryOptions {
  adapter: DbAdapter;
  inventoryRepo?: InventoryRepository;
  clock?: () => string;
}

export interface OrderRepository {
  getAreasAndTables(branchId: string): Promise<{ areas: AreaDoc[]; tables: TableDoc[] }>;
  saveArea(area: AreaDoc): Promise<void>;
  saveTable(table: TableDoc): Promise<void>;
  deleteArea(branchId: string, areaId: string): Promise<void>;
  deleteTable(branchId: string, tableId: string): Promise<void>;
  getActiveSession(branchId: string, tableId: string): Promise<OrderAggregateState | null>;
  getAllActiveSessions(branchId: string): Promise<Record<string, OrderAggregateState>>;
  appendEvents(
    branchId: string,
    sessionId: string,
    newEvents: OrderEventDoc[],
    projected?: OrderAggregateState
  ): Promise<OrderAggregateState>;
  getBankAccount(branchId: string): Promise<BankAccountDoc | null>;
  saveBankAccount(doc: BankAccountDoc): Promise<void>;
  getBillingSettings(branchId: string): Promise<BillingSettingsDoc>;
  saveBillingSettings(doc: BillingSettingsDoc): Promise<void>;
  nextSequence(branchId: string, deviceId: string, dateStr: string): Promise<number>;

  // ─── M4: Split / Merge / Transfer ─────────────────────────────────────────
  splitByItems(
    branchId: string,
    sessionId: string,
    sourceBillId: string,
    lineIds: string[],
    actorId: string,
    deviceId: string
  ): Promise<SplitByItemsResult>;

  splitEvenly(
    branchId: string,
    sessionId: string,
    billId: string,
    parts: number,
    actorId: string,
    deviceId: string
  ): Promise<SplitEvenlyResult>;

  splitBySeat(
    branchId: string,
    sessionId: string,
    billId: string,
    actorId: string,
    deviceId: string
  ): Promise<SplitBySeatResult>;

  mergeBills(
    branchId: string,
    sessionId: string,
    sourceBillIds: string[],
    actorId: string,
    deviceId: string,
    sourceBills?: BillDoc[],
    initialState?: OrderAggregateState
  ): Promise<MergeBillsResult>;

  transferTable(
    branchId: string,
    sessionId: string,
    fromTableId: string,
    toTableId: string,
    actorId: string,
    deviceId: string,
    reason?: string,
    initialState?: OrderAggregateState
  ): Promise<TransferTableResult>;

  moveLines(
    branchId: string,
    sessionId: string,
    sourceBillId: string,
    lineIds: string[],
    targetBillId: string,
    actorId: string,
    deviceId: string
  ): Promise<MoveLinesResult>;

  updateLineKdsStatus(
    branchId: string,
    sessionId: string,
    billId: string,
    lineId: string,
    status: KdsLineStatus,
    actorId: string,
    deviceId: string
  ): Promise<OrderAggregateState>;

  bumpTicketLines(
    branchId: string,
    sessionId: string,
    billId: string,
    lineIds: string[],
    actorId: string,
    deviceId: string
  ): Promise<OrderAggregateState>;

  recallTicketLine(
    branchId: string,
    sessionId: string,
    billId: string,
    lineId: string,
    actorId: string,
    deviceId: string
  ): Promise<OrderAggregateState>;
}

function isConflict(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const errObj = error as { status?: number; name?: string; message?: string };
    if (errObj.status === 409 || errObj.name === 'conflict') {
      return true;
    }
    if (typeof errObj.message === 'string' && /conflict/i.test(errObj.message)) {
      return true;
    }
  }
  return false;
}

function extractCleanId(id: string, prefix: string, branchId: string): string {
  const branchPrefix = `${prefix}:${branchId}:`;
  if (id.startsWith(branchPrefix)) {
    return id.slice(branchPrefix.length);
  }
  const simplePrefix = `${prefix}:`;
  if (id.startsWith(simplePrefix)) {
    return id.slice(simplePrefix.length);
  }
  return id;
}

function matchesTableId(tableIds: string[], tableId: string, branchId: string): boolean {
  if (!tableId || (tableId.includes(':') && !tableId.startsWith('table:'))) {
    return false;
  }
  let fullTableId = tableId;
  if (!tableId.startsWith('table:')) {
    try {
      fullTableId = tableDocId(branchId, tableId);
    } catch {
      return false;
    }
  }
  const shortTableId = tableId.startsWith('table:') ? tableId.split(':').pop()! : tableId;

  return tableIds.some(
    (t) =>
      t === tableId ||
      t === fullTableId ||
      t === shortTableId ||
      t.endsWith(`:${shortTableId}`) ||
      t === `table:${branchId}:${shortTableId}`
  );
}

function matchesSessionId(session: SessionDoc, targetId: string, branchId: string): boolean {
  if (session._id === targetId) return true;
  const cleanTarget = extractCleanId(extractCleanId(targetId, 'session_events', branchId), 'session', branchId);
  const cleanSession = extractCleanId(session._id, 'session', branchId);
  return cleanSession === cleanTarget;
}

function matchesTableOrSession(session: SessionDoc, targetId: string, branchId: string): boolean {
  if (matchesSessionId(session, targetId, branchId)) return true;
  if (targetId.includes(':') && !targetId.startsWith('table:')) {
    return false;
  }
  return matchesTableId(session.tableIds, targetId, branchId);
}

export function createOrderRepository(
  adapterOrOptions: DbAdapter | CreateOrderRepositoryOptions,
  clockParam?: () => string
): OrderRepository {
  let adapter: DbAdapter;
  let inventoryRepo: InventoryRepository | undefined = undefined;
  let clock: () => string;

  if (typeof (adapterOrOptions as unknown as { get: unknown }).get === 'function') {
    adapter = adapterOrOptions as DbAdapter;
    clock = clockParam || (() => new Date().toISOString());
  } else {
    const opts = adapterOrOptions as CreateOrderRepositoryOptions;
    adapter = opts.adapter;
    inventoryRepo = opts.inventoryRepo;
    clock = opts.clock || clockParam || (() => new Date().toISOString());
  }

  return {
    async getAreasAndTables(branchId: string): Promise<{ areas: AreaDoc[]; tables: TableDoc[] }> {
      const docs = await adapter.allDocs({ branchId });

      const areas = docs
        .filter((d) => (d._id.startsWith('area:') || d.docType === 'area') && d.deletedAt === undefined)
        .map((d) => d as unknown as AreaDoc)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''));

      const tables = docs
        .filter((d) => (d._id.startsWith('table:') || d.docType === 'table') && d.deletedAt === undefined)
        .map((d) => d as unknown as TableDoc)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (a.code ?? '').localeCompare(b.code ?? ''));

      return { areas, tables };
    },

    async saveArea(area: AreaDoc): Promise<void> {
      if (!area.branchId || typeof area.branchId !== 'string' || area.branchId.trim() === '') {
        throw new Error('saveArea(): branchId is required');
      }
      const id = area._id;
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const existing = await adapter.get(id);
          const toSave = {
            ...area,
            docType: 'area',
            schemaVersion: SCHEMA_VERSION,
            createdAt: area.createdAt || existing?.createdAt || clock(),
            updatedAt: clock(),
            ...(existing?._rev ? { _rev: existing._rev } : {}),
          } as unknown as DocEnvelope;
          await adapter.put(toSave);
          return;
        } catch (err) {
          if (isConflict(err) && attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          throw err;
        }
      }
    },

    async saveTable(table: TableDoc): Promise<void> {
      if (!table.branchId || typeof table.branchId !== 'string' || table.branchId.trim() === '') {
        throw new Error('saveTable(): branchId is required');
      }
      const id = table._id;
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const existing = await adapter.get(id);
          const toSave = {
            ...table,
            docType: 'table',
            schemaVersion: SCHEMA_VERSION,
            createdAt: table.createdAt || existing?.createdAt || clock(),
            updatedAt: clock(),
            ...(existing?._rev ? { _rev: existing._rev } : {}),
          } as unknown as DocEnvelope;
          await adapter.put(toSave);
          return;
        } catch (err) {
          if (isConflict(err) && attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          throw err;
        }
      }
    },

    async deleteArea(branchId: string, areaId: string): Promise<void> {
      if (!branchId || typeof branchId !== 'string' || branchId.trim() === '') {
        throw new Error('deleteArea(): branchId is required');
      }
      if (!areaId || typeof areaId !== 'string' || areaId.trim() === '') {
        throw new Error('deleteArea(): areaId is required');
      }
      const fullAreaId = areaId.startsWith('area:') ? areaId : areaDocId(branchId, areaId);
      const shortAreaId = areaId.startsWith('area:') ? areaId.split(':').pop()! : areaId;

      const { tables } = await this.getAreasAndTables(branchId);
      const hasTables = tables.some(
        (t) => t.areaId === fullAreaId || t.areaId === shortAreaId || t.areaId === areaId
      );
      if (hasTables) {
        throw new Error(`Cannot delete area "${areaId}" because it contains tables`);
      }

      const existing = await adapter.get(fullAreaId);
      if (!existing || existing.deletedAt) {
        return;
      }

      await adapter.put({
        ...existing,
        deletedAt: clock(),
        updatedAt: clock(),
      });
    },

    async deleteTable(branchId: string, tableId: string): Promise<void> {
      if (!branchId || typeof branchId !== 'string' || branchId.trim() === '') {
        throw new Error('deleteTable(): branchId is required');
      }
      if (!tableId || typeof tableId !== 'string' || tableId.trim() === '') {
        throw new Error('deleteTable(): tableId is required');
      }
      const fullTableId = tableId.startsWith('table:') ? tableId : tableDocId(branchId, tableId);

      const activeSession = await this.getActiveSession(branchId, fullTableId);
      if (activeSession && activeSession.session.status === 'open') {
        throw new Error(`Cannot delete table "${tableId}" because it currently has an active dining session`);
      }

      const existing = await adapter.get(fullTableId);
      if (!existing || existing.deletedAt) {
        return;
      }

      await adapter.put({
        ...existing,
        deletedAt: clock(),
        updatedAt: clock(),
      });
    },

    async getActiveSession(branchId: string, tableOrSessionId: string): Promise<OrderAggregateState | null> {
      const docs = await adapter.allDocs({ branchId });

      // 1. Check session_events docs
      for (const doc of docs) {
        if (doc._id.startsWith('session_events:') || doc.docType === 'session_events') {
          const eventsDoc = doc as unknown as SessionEventsDoc;
          if (eventsDoc.closedAt) continue;

          const session = eventsDoc.snapshot?.session;
          const bill = eventsDoc.snapshot?.bill;

          if (session && session.status === 'open' && matchesTableOrSession(session, tableOrSessionId, branchId)) {
            if (bill && bill.status !== 'paid' && bill.status !== 'voided') {
              return createInitialOrderState(session, bill);
            }
          }
        }
      }

      // 2. Check materialized session docs
      for (const doc of docs) {
        if (doc._id.startsWith('session:') || doc.docType === 'session') {
          const session = doc as unknown as SessionDoc;
          if (session.status === 'open' && matchesTableOrSession(session, tableOrSessionId, branchId)) {
            let bill: BillDoc | null = null;
            if (session.billIds && session.billIds.length > 0) {
              const bId = session.billIds[0]!;
              const bDoc = await adapter.get(bId);
              if (bDoc && bDoc.deletedAt === undefined) {
                bill = bDoc as unknown as BillDoc;
              }
            }
            if (bill && bill.status !== 'paid' && bill.status !== 'voided') {
              return createInitialOrderState(session, bill);
            }
          }
        }
      }

      return null;
    },

    async getAllActiveSessions(branchId: string): Promise<Record<string, OrderAggregateState>> {
      const docs = await adapter.allDocs({ branchId });
      const result: Record<string, OrderAggregateState> = {};

      // 1. Check session_events docs
      for (const doc of docs) {
        if (doc._id.startsWith('session_events:') || doc.docType === 'session_events') {
          const eventsDoc = doc as unknown as SessionEventsDoc;
          if (eventsDoc.closedAt) continue;

          const session = eventsDoc.snapshot?.session;
          const bill = eventsDoc.snapshot?.bill;

          if (session && session.status === 'open') {
            if (bill && bill.status !== 'paid' && bill.status !== 'voided') {
              const state = createInitialOrderState(session, bill);
              result[session._id] = state;
              for (const tid of session.tableIds) {
                result[tid] = state;
                const fullTableId = tid.startsWith('table:') ? tid : tableDocId(branchId, tid);
                const shortTableId = tid.startsWith('table:') ? tid.split(':').pop()! : tid;
                result[fullTableId] = state;
                result[shortTableId] = state;
              }
            }
          }
        }
      }

      // 2. Check materialized session docs
      for (const doc of docs) {
        if (doc._id.startsWith('session:') || doc.docType === 'session') {
          const session = doc as unknown as SessionDoc;
          if (session.status === 'open') {
            let bill: BillDoc | null = null;
            if (session.billIds && session.billIds.length > 0) {
              const bId = session.billIds[0]!;
              const bDoc = await adapter.get(bId);
              if (bDoc && bDoc.deletedAt === undefined) {
                bill = bDoc as unknown as BillDoc;
              }
            }
            if (bill && bill.status !== 'paid' && bill.status !== 'voided') {
              const state = createInitialOrderState(session, bill);
              if (!result[session._id]) result[session._id] = state;
              for (const tid of session.tableIds) {
                const fullTableId = tid.startsWith('table:') ? tid : tableDocId(branchId, tid);
                const shortTableId = tid.startsWith('table:') ? tid.split(':').pop()! : tid;
                if (!result[tid]) result[tid] = state;
                if (!result[fullTableId]) result[fullTableId] = state;
                if (!result[shortTableId]) result[shortTableId] = state;
              }
            }
          }
        }
      }

      return result;
    },

    async appendEvents(
      branchId: string,
      sessionId: string,
      newEvents: OrderEventDoc[],
      projected: OrderAggregateState
    ): Promise<OrderAggregateState> {
      const cleanSessionId = extractCleanId(sessionId, 'session_events', branchId);
      const cleanSessId = extractCleanId(cleanSessionId, 'session', branchId);
      const eventsDocId = sessionEventsDocId(branchId, cleanSessId);

      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const existingDoc = (await adapter.get(eventsDocId)) as unknown as SessionEventsDoc | null;

          const existingEvents: OrderEventDoc[] = existingDoc?.events ? [...existingDoc.events] : [];
          const existingIds = new Set(existingEvents.map((e) => e.eventId));

          // Filter new events to avoid duplicates
          const eventsToAdd = newEvents.filter((e) => !existingIds.has(e.eventId));
          const allEvents = [...existingEvents, ...eventsToAdd];

          // Determine base state and reduce
          let finalState: OrderAggregateState;
          if (existingDoc?.snapshot) {
            const baseState = createInitialOrderState(
              existingDoc.snapshot.session,
              existingDoc.snapshot.bill
            );
            finalState = eventsToAdd.length > 0 ? reduceOrderEvents(baseState, eventsToAdd) : baseState;
          } else if (allEvents.length > 0) {
            const hasLineEvents = allEvents.some((e) => e.type === 'LINE_ADDED');
            const base = projected && projected.bill && projected.bill.lines && projected.bill.lines.length > 0
              ? createInitialOrderState(
                  projected.session,
                  hasLineEvents
                    ? {
                        ...projected.bill,
                        lines: [],
                        discounts: [],
                        surcharges: [],
                        payments: [],
                      }
                    : projected.bill
                )
              : projected || createInitialOrderState(
                  {
                    _id: sessionDocId(branchId, cleanSessId),
                    branchId,
                    tableIds: [],
                    guestCount: 1,
                    billIds: [allEvents[0]?.billId || 'b1'],
                    status: 'open',
                    openedAt: allEvents[0]?.createdAt || clock(),
                    openedBy: allEvents[0]?.actorId || 'system',
                  },
                  {
                    _id: billDocId(branchId, allEvents[0]?.billId || 'b1'),
                    branchId,
                    sessionId: cleanSessId,
                    billNumber: '',
                    paymentRef: '',
                    status: 'draft',
                    lines: [],
                    discounts: [],
                    surcharges: [],
                    taxMode: 'inclusive',
                    taxLines: [],
                    taxTotal: money(0, 'VND'),
                    subtotal: money(0, 'VND'),
                    discountTotal: money(0, 'VND'),
                    surchargeTotal: money(0, 'VND'),
                    total: money(0, 'VND'),
                    payments: [],
                    balanceRemaining: money(0, 'VND'),
                    createdAt: allEvents[0]?.createdAt || clock(),
                    updatedAt: allEvents[0]?.createdAt || clock(),
                  }
                );
            finalState = reduceOrderEvents(base, allEvents);
          } else {
            finalState = projected!;
          }

          const isClosed =
            finalState.bill.status === 'paid' ||
            finalState.session.status === 'closed' ||
            allEvents.some((e) => e.type === 'BILL_CLOSED' || e.type === 'SESSION_CLOSED');

          const closedAt = isClosed
            ? finalState.session.closedAt || finalState.bill.paidAt || clock()
            : undefined;

          const effectiveTableNameSnapshot =
            finalState.bill.tableNameSnapshot ||
            projected?.bill?.tableNameSnapshot;

          const docToSave = {
            _id: eventsDocId,
            branchId,
            sessionId: cleanSessId,
            docType: 'session_events',
            schemaVersion: SCHEMA_VERSION,
            events: allEvents,
            snapshot: {
              session: finalState.session,
              bill: {
                ...finalState.bill,
                ...(effectiveTableNameSnapshot ? { tableNameSnapshot: effectiveTableNameSnapshot } : {}),
              },
            },
            ...(closedAt !== undefined ? { closedAt } : {}),
            createdAt: (existingDoc as unknown as DocEnvelope)?.createdAt || clock(),
            updatedAt: clock(),
            ...(existingDoc && (existingDoc as unknown as DocEnvelope)._rev
              ? { _rev: (existingDoc as unknown as DocEnvelope)._rev }
              : {}),
          } as unknown as DocEnvelope;

          await adapter.put(docToSave);

          // Materialize BillDoc and SessionDoc when closed or paid
          if (isClosed) {
            const existingBill = await adapter.get(finalState.bill._id);
            const billEnvelope = {
              ...existingBill,
              ...finalState.bill,
              ...(effectiveTableNameSnapshot || (existingBill as unknown as BillDoc)?.tableNameSnapshot
                ? { tableNameSnapshot: effectiveTableNameSnapshot || (existingBill as unknown as BillDoc)?.tableNameSnapshot }
                : {}),
              docType: 'bill',
              schemaVersion: SCHEMA_VERSION,
              createdAt: finalState.bill.createdAt || clock(),
              updatedAt: clock(),
              ...(existingBill?._rev ? { _rev: existingBill._rev } : {}),
            } as unknown as DocEnvelope;
            await adapter.put(billEnvelope);

            // Trigger automatic inventory deduction if bill is paid
            if (inventoryRepo && finalState.bill.status === 'paid') {
              const billId =
                (finalState.bill as unknown as { billId?: string }).billId ||
                extractCleanId(finalState.bill._id, 'bill', branchId);
              const existingMovements = await inventoryRepo.getMovements(branchId);
              const alreadyDeducted = existingMovements.some(
                (m) => m.type === 'sale_deduction' && m.refId === billId,
              );
              if (!alreadyDeducted) {
                const recipes = await inventoryRepo.getRecipes();
                const actor = newEvents[0]?.actorId || 'pos_system';
                const deductions = resolveBillDeductions(finalState.bill, recipes, actor);
                for (const d of deductions) {
                  await inventoryRepo.recordMovement(createMovementDoc(d));
                }
              }
            }

            const existingSession = await adapter.get(finalState.session._id);
            const sessionEnvelope = {
              ...finalState.session,
              docType: 'session',
              schemaVersion: SCHEMA_VERSION,
              closedAt: closedAt ?? clock(),
              createdAt: finalState.session.openedAt || clock(),
              updatedAt: clock(),
              ...(existingSession?._rev ? { _rev: existingSession._rev } : {}),
            } as unknown as DocEnvelope;
            await adapter.put(sessionEnvelope);
          }

          return finalState;
        } catch (err) {
          if (isConflict(err) && attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          throw err;
        }
      }
      throw new Error(`appendEvents(): failed to append events for ${eventsDocId} after ${MAX_ATTEMPTS} attempts`);
    },

    async getBankAccount(branchId: string): Promise<BankAccountDoc | null> {
      const id = bankAccountDocId(branchId);
      const doc = await adapter.get(id);
      if (!doc || doc.deletedAt !== undefined) return null;
      return doc as unknown as BankAccountDoc;
    },

    async saveBankAccount(doc: BankAccountDoc): Promise<void> {
      if (!doc.branchId || typeof doc.branchId !== 'string' || doc.branchId.trim() === '') {
        throw new Error('saveBankAccount(): branchId is required');
      }
      const id = doc._id || bankAccountDocId(doc.branchId);
      const MAX_ATTEMPTS = 3;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const existing = await adapter.get(id);
          const toSave = {
            ...doc,
            _id: id,
            docType: 'bank_account',
            schemaVersion: SCHEMA_VERSION,
            createdAt: existing?.createdAt || clock(),
            updatedAt: doc.updatedAt || clock(),
            ...(existing?._rev ? { _rev: existing._rev } : {}),
          } as unknown as DocEnvelope;
          await adapter.put(toSave);
          return;
        } catch (err) {
          if (isConflict(err) && attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          throw err;
        }
      }
    },

    async getBillingSettings(branchId: string): Promise<BillingSettingsDoc> {
      return fetchBillingSettings(adapter, branchId);
    },

    async saveBillingSettings(doc: BillingSettingsDoc): Promise<void> {
      await persistBillingSettings(adapter, doc, clock);
    },

    async nextSequence(branchId: string, deviceId: string, dateStr: string): Promise<number> {
      const id = counterDocId(branchId, deviceId, dateStr);
      const MAX_ATTEMPTS = 10;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const existing = await adapter.get(id);
          const rawRecord = existing as unknown as Record<string, unknown> | null;
          const currentSeq = typeof rawRecord?.['seq'] === 'number'
            ? (rawRecord['seq'] as number)
            : 0;
          const nextSeq = currentSeq + 1;
          const toSave = {
            _id: id,
            branchId,
            docType: 'counter',
            schemaVersion: SCHEMA_VERSION,
            deviceId,
            dateStr,
            seq: nextSeq,
            createdAt: existing?.createdAt || clock(),
            updatedAt: clock(),
            ...(existing?._rev ? { _rev: existing._rev } : {}),
          } as unknown as DocEnvelope;
          await adapter.put(toSave);
          return nextSeq;
        } catch (err) {
          if (isConflict(err) && attempt < MAX_ATTEMPTS - 1) {
            continue;
          }
          throw err;
        }
      }
      throw new Error(`nextSequence(): failed to increment counter for ${id} after ${MAX_ATTEMPTS} attempts`);
    },

    // ─── M4: Split / Merge / Transfer ─────────────────────────────────────────

    async splitByItems(
      branchId: string,
      sessionId: string,
      sourceBillId: string,
      lineIds: string[],
      actorId: string,
      deviceId: string
    ): Promise<SplitByItemsResult> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('splitByItems(): active session not found');
      const sourceBill = state.bill.lines.find((l) => l.lineId === lineIds[0])
        ? state.bill
        : null;
      // Find the source bill by ID from session events
      const srcBill = sourceBill ?? state.bill;
      if (srcBill._id !== sourceBillId) {
        throw new Error(`splitByItems(): bill ${sourceBillId} not found in session`);
      }
      const result = splitByItems(srcBill, lineIds, actorId, deviceId, sessionId, now);
      const events = result.events;
      await this.appendEvents(branchId, sessionId, events, state);
      return result;
    },

    async splitEvenly(
      branchId: string,
      sessionId: string,
      billId: string,
      parts: number,
      actorId: string,
      deviceId: string
    ): Promise<SplitEvenlyResult> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('splitEvenly(): active session not found');
      const srcBill = state.bill._id === billId ? state.bill : null;
      if (!srcBill) throw new Error(`splitEvenly(): bill ${billId} not found in session`);
      const result = splitEvenly(srcBill, parts, actorId, deviceId, sessionId, now);
      const events = result.events;
      await this.appendEvents(branchId, sessionId, events, state);
      return result;
    },

    async splitBySeat(
      branchId: string,
      sessionId: string,
      billId: string,
      actorId: string,
      deviceId: string
    ): Promise<SplitBySeatResult> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('splitBySeat(): active session not found');
      const srcBill = state.bill._id === billId ? state.bill : null;
      if (!srcBill) throw new Error(`splitBySeat(): bill ${billId} not found in session`);
      const result = splitBySeat(srcBill, actorId, deviceId, sessionId, now);
      const events = result.events;
      await this.appendEvents(branchId, sessionId, events, state);
      return result;
    },

    async mergeBills(
      branchId: string,
      sessionId: string,
      sourceBillIds: string[],
      actorId: string,
      deviceId: string,
      sourceBills?: BillDoc[],
      initialState?: OrderAggregateState
    ): Promise<MergeBillsResult> {
      const now = clock();
      const state = (await this.getActiveSession(branchId, sessionId)) ?? initialState;
      if (!state) throw new Error('mergeBills(): active session not found');

      // Resolve all source bills
      const resolvedBills: BillDoc[] = [];
      const passedBillsMap = new Map((sourceBills || []).map((b) => [b._id, b]));
      let activeSessionsRecord: Record<string, OrderAggregateState> | null = null;

      for (const id of sourceBillIds) {
        if (state.bill._id === id) {
          resolvedBills.push(state.bill);
          continue;
        }
        if (passedBillsMap.has(id)) {
          resolvedBills.push(passedBillsMap.get(id)!);
          continue;
        }
        // Try getting from adapter
        try {
          const directDoc = await adapter.get(id);
          if (directDoc && (directDoc as unknown as BillDoc).lines) {
            resolvedBills.push(directDoc as unknown as BillDoc);
            continue;
          }
        } catch {
          // not found directly in adapter
        }
        // Search in all active sessions
        if (!activeSessionsRecord) {
          activeSessionsRecord = await this.getAllActiveSessions(branchId);
        }
        const foundInActive = Object.values(activeSessionsRecord).find((s) => s.bill._id === id);
        if (foundInActive) {
          resolvedBills.push(foundInActive.bill);
          continue;
        }
        // Fallback: clone state.bill with target id
        resolvedBills.push({ ...state.bill, _id: id });
      }

      const merged = mergeBills(
        resolvedBills,
        actorId,
        deviceId,
        sessionId,
        now
      );
      const events = merged.events;
      await this.appendEvents(branchId, sessionId, events, state);

      // If any of the merged bills belonged to another active session in DB, append a BILL_MERGED event to close it
      if (activeSessionsRecord) {
        const otherSessionsProcessed = new Set<string>();
        for (const s of Object.values(activeSessionsRecord)) {
          if (s.session._id !== state.session._id && !otherSessionsProcessed.has(s.session._id)) {
            if (sourceBillIds.includes(s.bill._id)) {
              otherSessionsProcessed.add(s.session._id);
              try {
                const mergeEvent: OrderEventDoc = {
                  eventId: `ev-merged-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  type: 'BILL_MERGED',
                  sessionId: s.session._id,
                  billId: s.bill._id,
                  actorId,
                  deviceId,
                  payload: {
                    mergedIntoSessionId: sessionId,
                    mergedIntoBillId: merged.mergedBill._id,
                  },
                  createdAt: now,
                  schemaVersion: 1,
                };
                const closeEvent: OrderEventDoc = {
                  eventId: `ev-close-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                  type: 'SESSION_CLOSED',
                  sessionId: s.session._id,
                  billId: s.bill._id,
                  actorId,
                  deviceId,
                  payload: {
                    reason: `Merged into session ${sessionId}`,
                  },
                  createdAt: now,
                  schemaVersion: 1,
                };
                await this.appendEvents(branchId, s.session._id, [mergeEvent, closeEvent], {
                  session: { ...s.session, status: 'closed', closedAt: now },
                  bill: { ...s.bill, status: 'voided' },
                });
              } catch (e) {
                console.warn('Failed to close other session during merge:', s.session._id, e);
              }
            }
          }
        }
      }

      return merged;
    },

    async transferTable(
      branchId: string,
      sessionId: string,
      fromTableId: string,
      toTableId: string,
      actorId: string,
      deviceId: string,
      reason?: string,
      initialState?: OrderAggregateState
    ): Promise<TransferTableResult> {
      const now = clock();
      const state = (await this.getActiveSession(branchId, sessionId)) ?? initialState;
      if (!state) throw new Error('transferTable(): active session not found');
      const result = transferTable(state.session, fromTableId, toTableId, actorId, deviceId, reason, now);
      const events = result.events;
      await this.appendEvents(branchId, sessionId, events, {
        session: result.session,
        bill: state.bill,
        ...(state.tableStatus !== undefined ? { tableStatus: state.tableStatus } : {}),
      });
      return result;
    },

    async moveLines(
      branchId: string,
      sessionId: string,
      sourceBillId: string,
      lineIds: string[],
      targetBillId: string,
      actorId: string,
      deviceId: string
    ): Promise<MoveLinesResult> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('moveLines(): active session not found');
      const srcBill = state.bill._id === sourceBillId ? state.bill : null;
      if (!srcBill) throw new Error(`moveLines(): source bill ${sourceBillId} not found in session`);
      const tgtBill = state.bill._id === targetBillId ? state.bill : { ...state.bill, _id: targetBillId };
      const result = moveLines(srcBill, lineIds, tgtBill, actorId, deviceId, sessionId, now);
      const events = result.events;
      await this.appendEvents(branchId, sessionId, events, state);
      return result;
    },

    async updateLineKdsStatus(
      branchId: string,
      sessionId: string,
      billId: string,
      lineId: string,
      status: KdsLineStatus,
      actorId: string,
      deviceId: string
    ): Promise<OrderAggregateState> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('updateLineKdsStatus(): active session not found');

      const event: OrderEventDoc = {
        eventId: `ev-kds-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'LINE_STATUS_CHANGED',
        sessionId,
        billId,
        actorId,
        deviceId,
        payload: { lineId, status },
        createdAt: now,
        schemaVersion: 1,
      };

      return this.appendEvents(branchId, sessionId, [event], state);
    },

    async bumpTicketLines(
      branchId: string,
      sessionId: string,
      billId: string,
      lineIds: string[],
      actorId: string,
      deviceId: string
    ): Promise<OrderAggregateState> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('bumpTicketLines(): active session not found');

      const event: OrderEventDoc = {
        eventId: `ev-bump-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'LINE_BUMPED',
        sessionId,
        billId,
        actorId,
        deviceId,
        payload: { lineIds },
        createdAt: now,
        schemaVersion: 1,
      };

      return this.appendEvents(branchId, sessionId, [event], state);
    },

    async recallTicketLine(
      branchId: string,
      sessionId: string,
      billId: string,
      lineId: string,
      actorId: string,
      deviceId: string
    ): Promise<OrderAggregateState> {
      const now = clock();
      const state = await this.getActiveSession(branchId, sessionId);
      if (!state) throw new Error('recallTicketLine(): active session not found');

      const event: OrderEventDoc = {
        eventId: `ev-recall-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: 'LINE_RECALLED',
        sessionId,
        billId,
        actorId,
        deviceId,
        payload: { lineId, status: 'preparing' },
        createdAt: now,
        schemaVersion: 1,
      };

      return this.appendEvents(branchId, sessionId, [event], state);
    },
  };
}
