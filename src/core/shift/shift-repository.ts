import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { shiftDocId } from '../db/ids';
import { add, money, type Money } from '../money';
import type { BillDoc } from '../order/types';
import {
  calculateShiftVariance,
  createCashMovementDoc,
  createShiftDoc,
} from './shift-engine';
import type {
  CloseShiftInput,
  CreateCashMovementInput,
  OpenShiftInput,
  ShiftCashMovementDoc,
  ShiftDoc,
} from './types';

export interface ShiftRepository {
  openShift(input: OpenShiftInput): Promise<ShiftDoc>;
  getActiveShift(branchId: string, deviceId: string): Promise<ShiftDoc | null>;
  recordCashMovement(input: CreateCashMovementInput): Promise<ShiftCashMovementDoc>;
  getCashMovements(branchId: string, shiftId: string): Promise<ShiftCashMovementDoc[]>;
  closeShift(input: CloseShiftInput): Promise<ShiftDoc>;
  getShifts(branchId: string): Promise<ShiftDoc[]>;
}

export function createShiftRepository(adapter: DbAdapter): ShiftRepository {
  return {
    async openShift(input: OpenShiftInput): Promise<ShiftDoc> {
      const existingActive = await this.getActiveShift(input.branchId, input.deviceId);
      if (existingActive) {
        throw new Error(`An active shift is already open on this device: ${existingActive.shiftId}`);
      }

      const shift = createShiftDoc(input);
      await adapter.put(shift as unknown as DocEnvelope);
      return shift;
    },

    async getActiveShift(branchId: string, deviceId: string): Promise<ShiftDoc | null> {
      const all = await adapter.allDocs({ branchId });
      const shifts = all.filter(
        (doc) =>
          (doc as unknown as ShiftDoc).docType === 'shift' &&
          (doc as unknown as ShiftDoc).branchId === branchId &&
          (doc as unknown as ShiftDoc).deviceId === deviceId &&
          (doc as unknown as ShiftDoc).status === 'open' &&
          !doc.deletedAt,
      ) as unknown as ShiftDoc[];

      return shifts[0] ?? null;
    },

    async recordCashMovement(input: CreateCashMovementInput): Promise<ShiftCashMovementDoc> {
      const movement = createCashMovementDoc(input);
      await adapter.put(movement as unknown as DocEnvelope);
      return movement;
    },

    async getCashMovements(branchId: string, shiftId: string): Promise<ShiftCashMovementDoc[]> {
      const all = await adapter.allDocs({ branchId });
      const filtered = all.filter(
        (doc) =>
          (doc as unknown as ShiftCashMovementDoc).docType === 'shift_cash_movement' &&
          (doc as unknown as ShiftCashMovementDoc).branchId === branchId &&
          (doc as unknown as ShiftCashMovementDoc).shiftId === shiftId &&
          !doc.deletedAt,
      ) as unknown as ShiftCashMovementDoc[];

      return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },

    async closeShift(input: CloseShiftInput): Promise<ShiftDoc> {
      const docId = shiftDocId(input.branchId, input.shiftId);
      const rawDoc = await adapter.get(docId);
      if (!rawDoc || rawDoc.deletedAt) {
        throw new Error(`Shift not found: ${input.shiftId}`);
      }

      const shift = rawDoc as unknown as ShiftDoc;
      if (shift.status === 'closed') {
        return shift; // Idempotent
      }

      const closedAt = input.closedAt || new Date().toISOString();
      const currency = shift.openingCash.currency;

      // 1. Gather all cash movements for this shift
      const movements = await this.getCashMovements(input.branchId, input.shiftId);
      let cashIn = money(0, currency);
      let cashDrops = money(0, currency);

      for (const m of movements) {
        if (m.type === 'cash_in') {
          cashIn = add(cashIn, m.amount);
        } else if (m.type === 'cash_drop') {
          cashDrops = add(cashDrops, m.amount);
        }
      }

      // 2. Query paid bills within shift time window [openedAt, closedAt]
      const allDocs = await adapter.allDocs({ branchId: input.branchId });
      const paidBills = allDocs.filter((doc) => {
        const b = doc as unknown as BillDoc;
        const isBill = doc._id.startsWith('bill:') || (doc as unknown as { docType?: string }).docType === 'bill';
        return (
          isBill &&
          b.branchId === input.branchId &&
          b.status === 'paid' &&
          !doc.deletedAt
        );
      }) as unknown as BillDoc[];

      let cashSales = money(0, currency);
      const cashRefunds = money(0, currency);

      for (const bill of paidBills) {
        // Match payments created between shift openedAt and closedAt
        for (const payment of bill.payments) {
          if (
            payment.method === 'cash' &&
            payment.createdAt >= shift.openedAt &&
            payment.createdAt <= closedAt
          ) {
            cashSales = add(cashSales, payment.amount);
          }
        }
      }

      // 3. Calculate variance
      const { expectedCash, variance } = calculateShiftVariance(
        shift.openingCash,
        cashSales,
        cashRefunds,
        cashIn,
        cashDrops,
        input.countedCash,
      );

      const updatedShift: ShiftDoc = {
        ...shift,
        status: 'closed',
        closingCash: expectedCash,
        countedCash: input.countedCash,
        variance,
        closedAt,
        closedBy: input.closedBy,
        ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        ...(rawDoc._rev ? { _rev: rawDoc._rev } : {}),
      };

      await adapter.put(updatedShift as unknown as DocEnvelope);
      return updatedShift;
    },

    async getShifts(branchId: string): Promise<ShiftDoc[]> {
      const all = await adapter.allDocs({ branchId });
      const shifts = all.filter(
        (doc) =>
          (doc as unknown as ShiftDoc).docType === 'shift' &&
          (doc as unknown as ShiftDoc).branchId === branchId &&
          !doc.deletedAt,
      ) as unknown as ShiftDoc[];

      return shifts.sort((a, b) => b.openedAt.localeCompare(a.openedAt));
    },
  };
}
