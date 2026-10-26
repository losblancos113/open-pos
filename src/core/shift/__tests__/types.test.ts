import { describe, it, expect } from 'vitest';
import { shiftDocId, shiftCashMovementDocId, auditLogDocId } from '../../db/ids';
import type {
  ShiftDoc,
  ShiftCashMovementDoc,
  ShiftStatus,
  ShiftCashMovementType,
  OpenShiftInput,
  CloseShiftInput,
  CreateCashMovementInput,
} from '../types';
import type {
  AuditLogDoc,
  AuditAction,
  CreateAuditLogInput,
} from '../../audit/types';
import { money } from '../../money';

describe('Shift and Audit ID helpers and Types', () => {
  it('formats shiftDocId and cashMovementDocId correctly', () => {
    expect(shiftDocId('hq', 'sh_01')).toBe('shift:hq:sh_01');
    expect(shiftCashMovementDocId('dist1', 'csh_01')).toBe('shift_cash:dist1:csh_01');
    expect(auditLogDocId('hq', 'aud_01')).toBe('audit_log:hq:aud_01');
  });

  it('rejects empty strings or segments with colons', () => {
    expect(() => shiftDocId('', 's1')).toThrow('branchId must be a non-empty string');
    expect(() => shiftDocId('hq:1', 's1')).toThrow('branchId must not contain ":"');
    expect(() => shiftCashMovementDocId('hq', '')).toThrow('movementId must be a non-empty string');
    expect(() => auditLogDocId('', 'a1')).toThrow('branchId must be a non-empty string');
  });

  it('type checks shift and audit document structures', () => {
    const shift: ShiftDoc = {
      _id: shiftDocId('hq', 'sh_01'),
      branchId: 'hq',
      docType: 'shift',
      schemaVersion: 1,
      shiftId: 'sh_01',
      deviceId: 'term_01',
      userId: 'usr_01',
      userName: 'Cashier Alice',
      status: 'open',
      openingCash: money(500000, 'VND'),
      openedAt: '2026-10-26T08:00:00.000Z',
    };
    expect(shift.status).toBe('open');

    const movement: ShiftCashMovementDoc = {
      _id: shiftCashMovementDocId('hq', 'm1'),
      branchId: 'hq',
      docType: 'shift_cash_movement',
      schemaVersion: 1,
      movementId: 'm1',
      shiftId: 'sh_01',
      type: 'cash_drop',
      amount: money(200000, 'VND'),
      reason: 'Safe drop',
      actorId: 'usr_01',
      createdAt: '2026-10-26T12:00:00.000Z',
    };
    expect(movement.type).toBe('cash_drop');

    const audit: AuditLogDoc = {
      _id: auditLogDocId('hq', 'aud_01'),
      branchId: 'hq',
      docType: 'audit_log',
      schemaVersion: 1,
      auditId: 'aud_01',
      actorId: 'usr_01',
      role: 'cashier',
      action: 'shift_open',
      deviceId: 'term_01',
      createdAt: '2026-10-26T08:00:00.000Z',
    };
    expect(audit.action).toBe('shift_open');
  });
});
