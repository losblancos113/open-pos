import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { auditLogDocId } from '../db/ids';
import type { AuditAction, AuditLogDoc, CreateAuditLogInput } from './types';

export const AUDIT_LOG_DOC_TYPE = 'audit_log';

function requireNonEmpty(value: string | undefined | null, fieldName: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return value.trim();
}

export interface AuditLogFilter {
  action?: AuditAction;
  actorId?: string;
  targetId?: string;
}

export interface AuditLogger {
  log(input: CreateAuditLogInput): Promise<AuditLogDoc>;
  getLogs(branchId: string, filter?: AuditLogFilter): Promise<AuditLogDoc[]>;
}

export function createAuditLogger(adapter: DbAdapter): AuditLogger {
  return {
    async log(input: CreateAuditLogInput): Promise<AuditLogDoc> {
      const branchId = requireNonEmpty(input.branchId, 'branchId');
      const actorId = requireNonEmpty(input.actorId, 'actorId');
      const role = requireNonEmpty(input.role, 'role');
      const action = requireNonEmpty(input.action, 'action') as AuditAction;
      const deviceId = requireNonEmpty(input.deviceId, 'deviceId');

      const auditId = input.auditId?.trim() || crypto.randomUUID();
      const createdAt = input.createdAt || new Date().toISOString();

      const doc: AuditLogDoc = {
        _id: auditLogDocId(branchId, auditId),
        branchId,
        docType: AUDIT_LOG_DOC_TYPE,
        schemaVersion: 1,
        auditId,
        actorId,
        role,
        action,
        ...(input.targetType?.trim() ? { targetType: input.targetType.trim() } : {}),
        ...(input.targetId?.trim() ? { targetId: input.targetId.trim() } : {}),
        ...(input.details ? { details: input.details } : {}),
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
        deviceId,
        createdAt,
      };

      await adapter.put(doc as unknown as DocEnvelope);
      return doc;
    },

    async getLogs(branchId: string, filter?: AuditLogFilter): Promise<AuditLogDoc[]> {
      const all = await adapter.allDocs({ branchId });
      let filtered = all.filter(
        (doc) =>
          (doc as unknown as AuditLogDoc).docType === AUDIT_LOG_DOC_TYPE &&
          (doc as unknown as AuditLogDoc).branchId === branchId &&
          !doc.deletedAt,
      ) as unknown as AuditLogDoc[];

      if (filter) {
        if (filter.action) {
          filtered = filtered.filter((doc) => doc.action === filter.action);
        }
        if (filter.actorId) {
          filtered = filtered.filter((doc) => doc.actorId === filter.actorId);
        }
        if (filter.targetId) {
          filtered = filtered.filter((doc) => doc.targetId === filter.targetId);
        }
      }

      return filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
