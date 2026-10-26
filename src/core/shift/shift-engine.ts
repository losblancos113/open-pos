import { shiftDocId, shiftCashMovementDocId } from '../db/ids';
import { add, sub, type Money } from '../money';
import type {
  CreateCashMovementInput,
  OpenShiftInput,
  ShiftCashMovementDoc,
  ShiftCashMovementType,
  ShiftDoc,
} from './types';

export const SHIFT_DOC_TYPE = 'shift';
export const SHIFT_CASH_MOVEMENT_DOC_TYPE = 'shift_cash_movement';

const VALID_CASH_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['cash_in', 'cash_drop']);

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

/**
 * Calculates expected cash and variance:
 * expectedCash = openingCash + cashSales - cashRefunds + cashIn - cashDrops
 * variance = countedCash - expectedCash
 */
export function calculateShiftVariance(
  openingCash: Money,
  cashSales: Money,
  cashRefunds: Money,
  cashIn: Money,
  cashDrops: Money,
  countedCash: Money,
): { expectedCash: Money; variance: Money } {
  // expectedCash = (openingCash + cashSales - cashRefunds) + cashIn - cashDrops
  const netSales = sub(cashSales, cashRefunds);
  const withOpening = add(openingCash, netSales);
  const withCashIn = add(withOpening, cashIn);
  const expectedCash = sub(withCashIn, cashDrops);

  const variance = sub(countedCash, expectedCash);

  return { expectedCash, variance };
}

export function createShiftDoc(input: OpenShiftInput): ShiftDoc {
  const branchId = requireNonEmpty(input.branchId, 'branchId');
  const deviceId = requireNonEmpty(input.deviceId, 'deviceId');
  const userId = requireNonEmpty(input.userId, 'userId');
  const userName = requireNonEmpty(input.userName, 'userName');

  if (!input.openingCash || typeof input.openingCash.minor !== 'number' || input.openingCash.minor < 0) {
    throw new Error('Opening cash must be a non-negative Money amount');
  }

  const shiftId = input.shiftId?.trim() || crypto.randomUUID();
  const openedAt = input.openedAt || new Date().toISOString();

  return {
    _id: shiftDocId(branchId, shiftId),
    branchId,
    docType: SHIFT_DOC_TYPE,
    schemaVersion: 1,
    shiftId,
    deviceId,
    userId,
    userName,
    status: 'open',
    openingCash: input.openingCash,
    openedAt,
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
  };
}

export function createCashMovementDoc(input: CreateCashMovementInput): ShiftCashMovementDoc {
  const branchId = requireNonEmpty(input.branchId, 'branchId');
  const shiftId = requireNonEmpty(input.shiftId, 'shiftId');
  const reason = requireNonEmpty(input.reason, 'reason');
  const actorId = requireNonEmpty(input.actorId, 'actorId');

  if (!VALID_CASH_MOVEMENT_TYPES.has(input.type)) {
    throw new Error(`Invalid cash movement type: ${input.type}`);
  }

  if (!input.amount || typeof input.amount.minor !== 'number' || input.amount.minor <= 0) {
    throw new Error('Cash movement amount must be positive');
  }

  const movementId = input.movementId?.trim() || crypto.randomUUID();
  const createdAt = input.createdAt || new Date().toISOString();

  return {
    _id: shiftCashMovementDocId(branchId, movementId),
    branchId,
    docType: SHIFT_CASH_MOVEMENT_DOC_TYPE,
    schemaVersion: 1,
    movementId,
    shiftId,
    type: input.type as ShiftCashMovementType,
    amount: input.amount,
    reason,
    actorId,
    createdAt,
  };
}
