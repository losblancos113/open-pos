import type { Money } from '../money';

export type ShiftStatus = 'open' | 'closed';

export interface ShiftDoc {
  readonly _id: string; // shift:<branchId>:<shiftId>
  readonly branchId: string;
  readonly docType: 'shift';
  readonly schemaVersion: 1;
  readonly shiftId: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly userName: string;
  readonly status: ShiftStatus;
  readonly openingCash: Money;
  readonly openedAt: string;
  readonly closingCash?: Money;
  readonly countedCash?: Money;
  readonly variance?: Money;
  readonly closedAt?: string;
  readonly closedBy?: string;
  readonly notes?: string;
  readonly _rev?: string;
}

export type ShiftCashMovementType = 'cash_in' | 'cash_drop';

export interface ShiftCashMovementDoc {
  readonly _id: string; // shift_cash:<branchId>:<movementId>
  readonly branchId: string;
  readonly docType: 'shift_cash_movement';
  readonly schemaVersion: 1;
  readonly movementId: string;
  readonly shiftId: string;
  readonly type: ShiftCashMovementType;
  readonly amount: Money;
  readonly reason: string;
  readonly actorId: string;
  readonly createdAt: string;
  readonly _rev?: string;
}

export interface OpenShiftInput {
  readonly shiftId?: string;
  readonly branchId: string;
  readonly deviceId: string;
  readonly userId: string;
  readonly userName: string;
  readonly openingCash: Money;
  readonly openedAt?: string;
  readonly notes?: string;
}

export interface CloseShiftInput {
  readonly branchId: string;
  readonly shiftId: string;
  readonly countedCash: Money;
  readonly closedBy: string;
  readonly closedAt?: string;
  readonly notes?: string;
}

export interface CreateCashMovementInput {
  readonly movementId?: string;
  readonly branchId: string;
  readonly shiftId: string;
  readonly type: ShiftCashMovementType;
  readonly amount: Money;
  readonly reason: string;
  readonly actorId: string;
  readonly createdAt?: string;
}
