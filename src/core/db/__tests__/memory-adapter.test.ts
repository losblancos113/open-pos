import { describe, it, expect, beforeEach } from 'vitest';
import { createMemoryAdapter } from '../memory-adapter';
import { createEnvelope } from '../envelope';
import type { DbAdapter } from '../adapter';

describe('memory adapter', () => {
  let db: DbAdapter;

  beforeEach(async () => {
    db = await createMemoryAdapter();
  });

  it('returns null for a missing document', async () => {
    expect(await db.get('product:nope')).toBeNull();
  });

  it('round-trips a document', async () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
    const saved = await db.put(doc);
    expect(saved._rev).toBeTruthy();

    const loaded = await db.get('product:p001');
    expect(loaded).toMatchObject({ _id: 'product:p001', docType: 'product', branchId: 'hq' });
  });

  it('bumps _rev on update', async () => {
    const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
    const first = await db.put(doc);
    const second = await db.put({ ...first, updatedAt: '2026-10-20T11:00:00.000Z' });
    expect(second._rev).not.toBe(first._rev);
  });

  it('filters allDocs by branchId', async () => {
    await db.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));
    await db.put(createEnvelope({ id: 'product:p002', docType: 'product', branchId: 'hq' }));
    await db.put(createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'branch2' }));

    const hqDocs = await db.allDocs({ branchId: 'hq' });
    expect(hqDocs.map((d) => d._id).sort()).toEqual(['product:p001', 'product:p002']);
  });

  it('removes a document', async () => {
    const doc = await db.put(
      createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
    );
    await db.remove('product:p001', doc._rev as string);
    expect(await db.get('product:p001')).toBeNull();
  });

  it('works without any network or IndexedDB', async () => {
    // memory adapter phải ghi được ngay cả khi không có hub — offline-first
    await expect(
      db.put(createEnvelope({ id: 'product:offline', docType: 'product', branchId: 'hq' })),
    ).resolves.toBeTruthy();
  });

  it('rejects a document without branchId', async () => {
    const doc = {
      ...createEnvelope({ id: 'product:nobranch', docType: 'product', branchId: 'hq' }),
      branchId: '',
    };
    await expect(db.put(doc)).rejects.toThrow(/branchId is required/);
  });

  it('hides soft-deleted documents from get and allDocs', async () => {
    const tombstone = {
      ...createEnvelope({ id: 'product:gone', docType: 'product', branchId: 'hq' }),
      deletedAt: '2026-10-20T12:00:00.000Z',
    };
    await db.put(tombstone);

    expect(await db.get('product:gone')).toBeNull();
    expect((await db.allDocs({ branchId: 'hq' })).map((d) => d._id)).toEqual([]);
  });
});
