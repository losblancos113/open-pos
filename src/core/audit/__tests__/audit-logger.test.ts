import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createAuditLogger } from '../audit-logger';

describe('Audit Logger Domain Service', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;
  let logger: ReturnType<typeof createAuditLogger>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
    logger = createAuditLogger(adapter);
  });

  it('records append-only immutable audit logs with generated auditId and timestamp', async () => {
    const entry = await logger.log({
      branchId: 'hq',
      actorId: 'usr_01',
      role: 'cashier',
      action: 'shift_open',
      targetType: 'shift',
      targetId: 'sh_01',
      deviceId: 'term_01',
      details: { openingCash: 500000 },
      createdAt: '2026-10-26T08:00:00.000Z',
    });

    expect(entry.docType).toBe('audit_log');
    expect(entry.branchId).toBe('hq');
    expect(entry.action).toBe('shift_open');
    expect(entry._id).toBe('audit_log:hq:' + entry.auditId);
    expect(entry.details).toEqual({ openingCash: 500000 });

    const logs = await logger.getLogs('hq');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.action).toBe('shift_open');
  });

  it('filters audit logs by action and actorId', async () => {
    await logger.log({
      branchId: 'hq',
      actorId: 'usr_01',
      role: 'cashier',
      action: 'login_success',
      deviceId: 'term_01',
      createdAt: '2026-10-26T07:55:00.000Z',
    });

    await logger.log({
      branchId: 'hq',
      actorId: 'usr_02',
      role: 'cashier',
      action: 'login_failed',
      deviceId: 'term_02',
      reason: 'Wrong PIN',
      createdAt: '2026-10-26T07:58:00.000Z',
    });

    await logger.log({
      branchId: 'hq',
      actorId: 'usr_01',
      role: 'cashier',
      action: 'bill_void',
      targetType: 'bill',
      targetId: 'b_01',
      reason: 'Customer cancelled',
      deviceId: 'term_01',
      createdAt: '2026-10-26T09:00:00.000Z',
    });

    // Filter by action
    const failedLogins = await logger.getLogs('hq', { action: 'login_failed' });
    expect(failedLogins).toHaveLength(1);
    expect(failedLogins[0]?.actorId).toBe('usr_02');

    // Filter by actorId
    const usr1Logs = await logger.getLogs('hq', { actorId: 'usr_01' });
    expect(usr1Logs).toHaveLength(2);

    // Another branch has 0 logs
    const dist1Logs = await logger.getLogs('dist1');
    expect(dist1Logs).toHaveLength(0);
  });

  it('rejects logs missing required fields', async () => {
    await expect(
      logger.log({
        branchId: '',
        actorId: 'u1',
        role: 'cashier',
        action: 'login_success',
        deviceId: 'd1',
      })
    ).rejects.toThrow('branchId must be a non-empty string');

    await expect(
      logger.log({
        branchId: 'hq',
        actorId: '',
        role: 'cashier',
        action: 'login_success',
        deviceId: 'd1',
      })
    ).rejects.toThrow('actorId must be a non-empty string');
  });
});
