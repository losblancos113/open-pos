export type AuditAction =
  | 'login_success'
  | 'login_failed'
  | 'shift_open'
  | 'shift_close'
  | 'cash_drop'
  | 'cash_in'
  | 'bill_void'
  | 'line_void'
  | 'discount_applied'
  | 'price_override'
  | 'bill_split'
  | 'bill_merged'
  | 'table_transferred'
  | 'data_backup'
  | 'data_restore';

export interface AuditLogDoc {
  readonly _id: string; // audit_log:<branchId>:<auditId>
  readonly branchId: string;
  readonly docType: 'audit_log';
  readonly schemaVersion: 1;
  readonly auditId: string;
  readonly actorId: string;
  readonly role: string;
  readonly action: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly details?: Record<string, unknown>;
  readonly reason?: string;
  readonly deviceId: string;
  readonly createdAt: string;
  readonly _rev?: string;
}

export interface CreateAuditLogInput {
  readonly auditId?: string;
  readonly branchId: string;
  readonly actorId: string;
  readonly role: string;
  readonly action: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly details?: Record<string, unknown>;
  readonly reason?: string;
  readonly deviceId: string;
  readonly createdAt?: string;
}
