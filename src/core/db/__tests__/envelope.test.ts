import { describe, it, expect } from 'vitest';
import { createEnvelope, SCHEMA_VERSION } from '../envelope';

describe('createEnvelope()', () => {
  const now = '2026-10-20T10:00:00.000Z';

  it('creates an envelope with branchId and schema version', () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq', now });
    expect(doc).toEqual({
      _id: 'product:p001',
      docType: 'product',
      branchId: 'hq',
      schemaVersion: SCHEMA_VERSION,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('rejects a missing or empty branchId', () => {
    expect(() => createEnvelope({ id: 'product:p001', docType: 'product', branchId: '', now })).toThrow(
      /branchId/i,
    );
  });

  it('rejects a missing id', () => {
    expect(() => createEnvelope({ id: '', docType: 'product', branchId: 'hq', now })).toThrow(/id/i);
  });

  it('rejects a missing docType', () => {
    expect(() =>
      createEnvelope({ id: 'product:p001', docType: '' as never, branchId: 'hq', now }),
    ).toThrow(/docType/i);
  });
});
