import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { purgeExpiredGuestTokens } from '../token-cleanup';

describe('Token Cleanup & Maintenance Utilities', () => {
  let adapter: Awaited<ReturnType<typeof createMemoryAdapter>>;

  beforeEach(async () => {
    adapter = await createMemoryAdapter();
  });

  it('purges expired guest and auth sessions, preserving active ones', async () => {
    const now = '2026-10-26T12:00:00.000Z';

    // 1. Expired guest session (expired 2 hours ago)
    await adapter.put({
      _id: 'guest_session:g_old',
      branchId: 'hq',
      docType: 'guest_session',
      schemaVersion: 1,
      expiresAt: '2026-10-26T10:00:00.000Z',
      tableId: 't1',
    } as any);

    // 2. Active guest session (expires in 4 hours)
    await adapter.put({
      _id: 'guest_session:g_active',
      branchId: 'hq',
      docType: 'guest_session',
      schemaVersion: 1,
      expiresAt: '2026-10-26T16:00:00.000Z',
      tableId: 't2',
    } as any);

    // 3. Regular product doc (should never be touched)
    await adapter.put({
      _id: 'product:p1',
      branchId: '*',
      docType: 'catalog_product',
      schemaVersion: 1,
      name: { vi: 'Cà phê', en: 'Coffee' },
    } as any);

    const purgedCount = await purgeExpiredGuestTokens(adapter, now);
    expect(purgedCount).toBe(1);

    const expiredDoc = await adapter.get('guest_session:g_old');
    expect(expiredDoc).toBeNull();

    const activeDoc = await adapter.get('guest_session:g_active');
    expect(activeDoc).not.toBeNull();

    const productDoc = await adapter.get('product:p1');
    expect(productDoc).not.toBeNull();
  });
});
