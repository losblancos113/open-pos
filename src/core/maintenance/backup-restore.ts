import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';

export interface DatabaseBackupSnapshot {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly docCount: number;
  readonly docs: readonly DocEnvelope[];
}

export async function exportDatabaseBackup(adapter: DbAdapter): Promise<DatabaseBackupSnapshot> {
  const allDocs = await adapter.allDocs({ includeGlobal: true });
  const activeDocs = allDocs.filter((doc) => !doc.deletedAt);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    docCount: activeDocs.length,
    docs: activeDocs,
  };
}

export async function restoreDatabaseBackup(
  adapter: DbAdapter,
  snapshot: DatabaseBackupSnapshot,
): Promise<{ restoredCount: number }> {
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Invalid backup snapshot: expected object');
  }

  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Unsupported backup schema version: ${snapshot.schemaVersion}`);
  }

  if (!Array.isArray(snapshot.docs)) {
    throw new Error('Invalid backup snapshot: docs must be an array');
  }

  let restoredCount = 0;
  for (const doc of snapshot.docs) {
    if (doc && typeof doc === 'object' && doc._id) {
      const existing = await adapter.get(doc._id);
      if (existing && existing._rev) {
        await adapter.put({
          ...doc,
          _rev: existing._rev,
        });
      } else {
        const { _rev, ...docWithoutRev } = doc;
        await adapter.put(docWithoutRev as unknown as DocEnvelope);
      }
      restoredCount++;
    }
  }

  return { restoredCount };
}
