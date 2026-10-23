import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { SCHEMA_VERSION } from '../db/envelope';
import {
  sessionDocId,
  sessionEventsDocId,
  tableDocId,
  bankAccountDocId,
} from '../db/ids';
import { createInitialOrderState, reduceOrderEvents } from './reducer';
import type {
  SessionDoc,
  BillDoc,
  AreaDoc,
  TableDoc,
  OrderAggregateState,
} from './types';
import type { OrderEventDoc, SessionEventsDoc } from './events';
import type { BankAccountDoc } from '../qr/bank-account';

export interface OrderRepository {
  getAreasAndTables(branchId: string): Promise<{ areas: AreaDoc[]; tables: TableDoc[] }>;
  saveArea(area: AreaDoc): Promise<void>;
  saveTable(table: TableDoc): Promise<void>;
  getActiveSession(branchId: string, tableId: string): Promise<OrderAggregateState | null>;
  appendEvents(
    branchId: string,
    sessionId: string,
    newEvents: OrderEventDoc[],
    projected: OrderAggregateState
  ): Promise<OrderAggregateState>;
  getBankAccount(branchId: string): Promise<BankAccountDoc | null>;
  saveBankAccount(doc: BankAccountDoc): Promise<void>;
  nextSequence(branchId: string, deviceId: string, dateStr: string): Promise<number>;
}

function isConflict(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /conflict/i.test(error.message);
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
  const fullTableId = tableId.startsWith('table:') ? tableId : tableDocId(branchId, tableId);
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

export function createOrderRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString()
): OrderRepository {
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

    async getActiveSession(branchId: string, tableId: string): Promise<OrderAggregateState | null> {
      const docs = await adapter.allDocs({ branchId });

      // 1. Check session_events docs
      for (const doc of docs) {
        if (doc._id.startsWith('session_events:') || doc.docType === 'session_events') {
          const eventsDoc = doc as unknown as SessionEventsDoc;
          if (eventsDoc.closedAt) continue;

          const session = eventsDoc.snapshot?.session;
          const bill = eventsDoc.snapshot?.bill;

          if (session && session.status === 'open' && matchesTableId(session.tableIds, tableId, branchId)) {
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
          if (session.status === 'open' && matchesTableId(session.tableIds, tableId, branchId)) {
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
          } else {
            finalState = eventsToAdd.length > 0 ? reduceOrderEvents(projected, eventsToAdd) : projected;
          }

          const isClosed =
            finalState.bill.status === 'paid' ||
            finalState.session.status === 'closed' ||
            allEvents.some((e) => e.type === 'BILL_CLOSED' || e.type === 'SESSION_CLOSED');

          const closedAt = isClosed
            ? finalState.session.closedAt || finalState.bill.paidAt || clock()
            : undefined;

          const docToSave = {
            _id: eventsDocId,
            branchId,
            sessionId: cleanSessId,
            docType: 'session_events',
            schemaVersion: SCHEMA_VERSION,
            events: allEvents,
            snapshot: {
              session: finalState.session,
              bill: finalState.bill,
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
              ...finalState.bill,
              docType: 'bill',
              schemaVersion: SCHEMA_VERSION,
              createdAt: finalState.bill.createdAt || clock(),
              updatedAt: clock(),
              ...(existingBill?._rev ? { _rev: existingBill._rev } : {}),
            } as unknown as DocEnvelope;
            await adapter.put(billEnvelope);

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

    async nextSequence(branchId: string, deviceId: string, dateStr: string): Promise<number> {
      const id = `counter:${branchId}:${deviceId}:${dateStr}`;
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
  };
}
