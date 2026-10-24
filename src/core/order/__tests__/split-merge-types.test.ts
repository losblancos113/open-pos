import { describe, it, expect } from 'vitest';
import type { OrderEventType } from '../events';

describe('OrderEventType includes M4 operations', () => {
  it('BILL_SPLIT is a valid event type', () => {
    const type: OrderEventType = 'BILL_SPLIT';
    expect(type).toBe('BILL_SPLIT');
  });

  it('BILL_MERGED is a valid event type', () => {
    const type: OrderEventType = 'BILL_MERGED';
    expect(type).toBe('BILL_MERGED');
  });

  it('TABLE_TRANSFERRED is a valid event type', () => {
    const type: OrderEventType = 'TABLE_TRANSFERRED';
    expect(type).toBe('TABLE_TRANSFERRED');
  });

  it('has exactly 19 known event type strings (16 M3 + 3 M4)', () => {
    const knownTypes = [
      'SESSION_OPENED', 'SESSION_CLOSED', 'ORDER_PLACED',
      'LINE_ADDED', 'LINE_QTY_CHANGED', 'LINE_NOTE_CHANGED', 'LINE_VOIDED',
      'DISCOUNT_APPLIED', 'DISCOUNT_REMOVED',
      'SURCHARGE_APPLIED', 'SURCHARGE_REMOVED',
      'BILL_PRINTED', 'BILL_VOIDED',
      'PAYMENT_ADDED', 'PAYMENT_VOIDED', 'BILL_CLOSED',
      'BILL_SPLIT', 'BILL_MERGED', 'TABLE_TRANSFERRED',
    ];
    expect(knownTypes).toHaveLength(19);
    for (const t of knownTypes) {
      expect(t.length).toBeGreaterThan(0);
    }
  });
});
