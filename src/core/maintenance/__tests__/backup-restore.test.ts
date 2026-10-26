import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { exportDatabaseBackup, restoreDatabaseBackup } from '../backup-restore';

describe('Database Backup & Restore Utilities', () => {
  it('exports entire database to a portable snapshot with metadata and checksum', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      _id: 'product:p1',
      branchId: '*',
      docType: 'catalog_product',
      schemaVersion: 1,
      name: { vi: 'Trà sen', en: 'Lotus Tea' },
    } as any);

    await adapter.put({
      _id: 'branch:hq',
      branchId: 'hq',
      docType: 'branch',
      schemaVersion: 1,
      name: 'Headquarters',
    } as any);

    const snapshot = await exportDatabaseBackup(adapter);

    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.docCount).toBe(2);
    expect(snapshot.docs).toHaveLength(2);
    expect(snapshot.exportedAt).toBeDefined();

    // Restore to a completely clean adapter
    const cleanAdapter = await createMemoryAdapter();
    const result = await restoreDatabaseBackup(cleanAdapter, snapshot);

    expect(result.restoredCount).toBe(2);

    const restoredProduct = await cleanAdapter.get('product:p1');
    expect(restoredProduct).not.toBeNull();
    expect((restoredProduct as any).name.vi).toBe('Trà sen');

    const restoredBranch = await cleanAdapter.get('branch:hq');
    expect(restoredBranch).not.toBeNull();
    expect((restoredBranch as any).name).toBe('Headquarters');
  });

  it('rejects invalid or corrupted snapshots without corrupting database', async () => {
    const adapter = await createMemoryAdapter();

    await expect(
      restoreDatabaseBackup(adapter, null as any)
    ).rejects.toThrow('Invalid backup snapshot: expected object');

    await expect(
      restoreDatabaseBackup(adapter, { schemaVersion: 999, docs: [] } as any)
    ).rejects.toThrow('Unsupported backup schema version');

    await expect(
      restoreDatabaseBackup(adapter, { schemaVersion: 1, docs: 'not an array' } as any)
    ).rejects.toThrow('Invalid backup snapshot: docs must be an array');
  });
});
