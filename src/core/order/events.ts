import type { SessionDoc, BillDoc } from './types';

export type OrderEventType =
  | 'SESSION_OPENED'
  | 'SESSION_CLOSED'
  | 'ORDER_PLACED'
  | 'LINE_ADDED'
  | 'LINE_QTY_CHANGED'
  | 'LINE_NOTE_CHANGED'
  | 'LINE_VOIDED'
  | 'DISCOUNT_APPLIED'
  | 'DISCOUNT_REMOVED'
  | 'SURCHARGE_APPLIED'
  | 'SURCHARGE_REMOVED'
  | 'BILL_PRINTED'
  | 'BILL_VOIDED'
  | 'PAYMENT_ADDED'
  | 'PAYMENT_VOIDED'
  | 'BILL_CLOSED'
  | 'BILL_SPLIT'
  | 'BILL_MERGED'
  | 'TABLE_TRANSFERRED'
  | 'LINE_STATUS_CHANGED'
  | 'LINE_BUMPED'
  | 'LINE_RECALLED';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface OrderEventDoc<T = any> {
  eventId: string; // uuid
  type: OrderEventType;
  sessionId: string;
  billId: string;
  actorId: string;
  deviceId: string;
  payload: T;
  createdAt: string;
  schemaVersion: 1;
}

/**
 * Spec §13.3: Events are partitioned per session into a single doc
 * to reduce document count ~8x and avoid replication explosion.
 */
export interface SessionEventsDoc {
  _id: string; // session_events:<branchId>:<sessionId>
  branchId: string;
  sessionId: string;
  events: OrderEventDoc[];
  snapshot?: {
    session: SessionDoc;
    bill: BillDoc;
  };
  closedAt?: string;
  updatedAt: string;
}
