import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabaseProvider, listDatabaseProviders } from '../src/core/db/provider';
import { createCosmosAdapterFromContainer } from '../src/core/db/cosmos-adapter';
import { createMemoryContainerMock } from '../src/core/db/__tests__/mock-cosmos-container';
import { createFirestoreAdapterFromDb } from '../src/core/db/firestore-adapter';
import { createMockFirestoreDb } from '../src/core/db/__tests__/mock-firestore';
import { createMemoryAdapter } from '../src/core/db/memory-adapter';
import { createEnvelope } from '../src/core/db/envelope';
import { migrateAdapterData } from '../src/core/db/migration';
import { DEFAULT_LOCAL_CONFIG, saveDatabaseConfig, loadDatabaseConfig, type CosmosDbConfig } from '../src/core/db/config';

describe('Database Provider End-to-End Lifecycle', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  it('verifies provider registration and registry listing for cosmos and firestore', () => {
    const providers = listDatabaseProviders();
    expect(providers).toContain('cosmos');
    expect(providers).toContain('firestore');

    const cosmosFactory = getDatabaseProvider('cosmos');
    expect(typeof cosmosFactory).toBe('function');

    const firestoreFactory = getDatabaseProvider('firestore');
    expect(typeof firestoreFactory).toBe('function');
  });

  it('runs complete CRUD, subscription, and migration pipeline on CosmosAdapter', async () => {
    const mockContainer = createMemoryContainerMock();
    const cosmosAdapter = await createCosmosAdapterFromContainer(mockContainer as any);

    let notifyCount = 0;
    const unsubscribe = cosmosAdapter.subscribe?.(() => {
      notifyCount++;
    });

    // 1. Create documents
    const doc1 = createEnvelope({ id: 'item:coffee', docType: 'product', branchId: 'hq' });
    const savedDoc1 = await cosmosAdapter.put(doc1);
    expect(savedDoc1._rev).toBeTruthy();
    expect(notifyCount).toBe(1);

    // 2. Read document
    const readDoc1 = await cosmosAdapter.get('item:coffee');
    expect(readDoc1?._id).toBe('item:coffee');
    expect(readDoc1?.branchId).toBe('hq');

    // 3. Update document with bump in _rev
    const updatedDoc1 = await cosmosAdapter.put({
      ...savedDoc1,
      updatedAt: '2026-11-01T12:00:00.000Z',
    });
    expect(updatedDoc1._rev).not.toBe(savedDoc1._rev);
    expect(notifyCount).toBe(2);

    // 4. Data migration from local store to Cosmos DB
    const localStore = await createMemoryAdapter();
    for (let i = 0; i < 15; i++) {
      await localStore.put(
        createEnvelope({ id: `imported:${i}`, docType: 'legacy', branchId: 'hq' }),
      );
    }

    const migrationProgress = await migrateAdapterData(localStore, cosmosAdapter, {
      batchSize: 5,
      delayBetweenBatchesMs: 5,
    });

    expect(migrationProgress.total).toBe(15);
    expect(migrationProgress.transferred).toBe(15);
    expect(migrationProgress.failed).toBe(0);
    expect(migrationProgress.isComplete).toBe(true);

    // Verify migrated docs in CosmosAdapter
    const allCosmosDocs = await cosmosAdapter.allDocs({ branchId: 'hq' });
    expect(allCosmosDocs.length).toBe(16); // doc1 + 15 migrated

    // 5. Delete document
    await cosmosAdapter.remove('item:coffee', updatedDoc1._rev!);
    expect(await cosmosAdapter.get('item:coffee')).toBeNull();
    expect(notifyCount).toBeGreaterThan(2);

    unsubscribe?.();
  });

  it('runs complete CRUD, subscription, and migration pipeline on FirestoreAdapter', async () => {
    const mockDb = createMockFirestoreDb();
    const firestoreAdapter = await createFirestoreAdapterFromDb(
      mockDb as any,
      'openpos_documents',
      mockDb.ops as any,
    );

    let notifyCount = 0;
    const unsubscribe = firestoreAdapter.subscribe?.(() => {
      notifyCount++;
    });

    // 1. Create document
    const doc1 = createEnvelope({ id: 'item:tea', docType: 'product', branchId: 'hq' });
    const savedDoc1 = await firestoreAdapter.put(doc1);
    expect(savedDoc1._rev).toBeTruthy();
    expect(notifyCount).toBe(1);

    // 2. Read document
    const readDoc1 = await firestoreAdapter.get('item:tea');
    expect(readDoc1?._id).toBe('item:tea');
    expect(readDoc1?.branchId).toBe('hq');

    // 3. Update document with bump in _rev
    const updatedDoc1 = await firestoreAdapter.put({
      ...savedDoc1,
      updatedAt: '2026-11-01T15:00:00.000Z',
    });
    expect(updatedDoc1._rev).not.toBe(savedDoc1._rev);
    expect(notifyCount).toBe(2);

    // 4. Migrate data from local store to Firestore
    const localStore = await createMemoryAdapter();
    for (let i = 0; i < 12; i++) {
      await localStore.put(
        createEnvelope({ id: `batch:${i}`, docType: 'inventory', branchId: 'hq' }),
      );
    }

    const migrationProgress = await migrateAdapterData(localStore, firestoreAdapter, {
      batchSize: 4,
      delayBetweenBatchesMs: 5,
    });

    expect(migrationProgress.total).toBe(12);
    expect(migrationProgress.transferred).toBe(12);
    expect(migrationProgress.failed).toBe(0);
    expect(migrationProgress.isComplete).toBe(true);

    const allFirestoreDocs = await firestoreAdapter.allDocs({ branchId: 'hq' });
    expect(allFirestoreDocs.length).toBe(13); // doc1 + 12 migrated

    // 5. Delete document
    await firestoreAdapter.remove('item:tea', updatedDoc1._rev!);
    expect(await firestoreAdapter.get('item:tea')).toBeNull();
    expect(notifyCount).toBeGreaterThan(2);

    unsubscribe?.();
  });
});
