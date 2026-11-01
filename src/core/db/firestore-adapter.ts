import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  type Firestore,
} from 'firebase/firestore';
import type { AllDocsOptions, DbAdapter } from './adapter';
import { GLOBAL_BRANCH_ID } from './branch';
import type { DocEnvelope } from './envelope';
import { registerDatabaseProvider } from './provider';
import type { FirestoreDbConfig } from './config';

export interface FirestoreOperations {
  doc: typeof doc;
  collection: typeof collection;
  getDoc: typeof getDoc;
  setDoc: typeof setDoc;
  deleteDoc: typeof deleteDoc;
  getDocs: typeof getDocs;
  query: typeof query;
  where: typeof where;
  onSnapshot: typeof onSnapshot;
}

const defaultOperations: FirestoreOperations = {
  doc,
  collection,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  onSnapshot,
};

function requireBranchId(doc: DocEnvelope): void {
  if (typeof doc.branchId !== 'string' || doc.branchId.trim() === '') {
    throw new Error(
      'firestore-adapter.put(): branchId is required on every document (see design doc Risk #17)',
    );
  }
}

function bumpRev(currentRev?: string): string {
  if (!currentRev) {
    return '1-00000001';
  }
  const parts = currentRev.split('-');
  const seq = parseInt(parts[0] || '1', 10);
  const nextSeq = isNaN(seq) ? 1 : seq + 1;
  const hash = Math.random().toString(16).substring(2, 10);
  return `${nextSeq}-${hash}`;
}

export async function createFirestoreAdapterFromDb(
  db: any,
  collectionName: string = 'openpos_documents',
  ops: FirestoreOperations = defaultOperations,
): Promise<DbAdapter> {
  const collRef = ops.collection(db, collectionName);

  const adapter: DbAdapter = {
    async get(id: string): Promise<DocEnvelope | null> {
      const docRef = ops.doc(collRef, id);
      const snap = await ops.getDoc(docRef);
      if (!snap.exists()) {
        return null;
      }
      const data = snap.data() as DocEnvelope;
      if (data.deletedAt !== undefined) {
        return null;
      }
      return data;
    },

    async put(docToSave: DocEnvelope): Promise<DocEnvelope> {
      requireBranchId(docToSave);

      const docRef = ops.doc(collRef, docToSave._id);
      const snap = await ops.getDoc(docRef);

      if (docToSave._rev !== undefined) {
        if (!snap.exists()) {
          throw new Error(
            `firestore-adapter.put(): conflict for ${docToSave._id} (got _rev ${docToSave._rev})`,
          );
        }
        const existing = snap.data() as DocEnvelope;
        if (existing._rev !== docToSave._rev) {
          throw new Error(
            `firestore-adapter.put(): conflict for ${docToSave._id} (got _rev ${docToSave._rev})`,
          );
        }
      } else {
        if (snap.exists()) {
          throw new Error(
            `firestore-adapter.put(): conflict for ${docToSave._id} (got _rev undefined)`,
          );
        }
      }

      const newRev = bumpRev(docToSave._rev);
      const savedDoc: DocEnvelope = {
        ...docToSave,
        _rev: newRev,
      };

      await ops.setDoc(docRef, savedDoc);
      return savedDoc;
    },

    async allDocs(options?: AllDocsOptions): Promise<DocEnvelope[]> {
      const branchId = options?.branchId;
      const includeGlobal = options?.includeGlobal === true;

      let q: any = collRef;

      if (branchId !== undefined) {
        if (includeGlobal) {
          q = ops.query(collRef, ops.where('branchId', 'in', [branchId, GLOBAL_BRANCH_ID]));
        } else {
          q = ops.query(collRef, ops.where('branchId', '==', branchId));
        }
      }

      const snap = await ops.getDocs(q);
      const results: DocEnvelope[] = [];

      for (const d of snap.docs) {
        const item = d.data() as DocEnvelope;
        if (item.deletedAt !== undefined) continue;

        if (branchId !== undefined) {
          if (item.branchId !== branchId) {
            if (!(includeGlobal && item.branchId === GLOBAL_BRANCH_ID)) continue;
          }
        }

        results.push(item);
      }

      return results;
    },

    async remove(id: string, rev: string): Promise<void> {
      const docRef = ops.doc(collRef, id);
      const snap = await ops.getDoc(docRef);

      if (!snap.exists()) {
        return;
      }

      const existing = snap.data() as DocEnvelope;
      if (existing._rev !== rev) {
        throw new Error(`firestore-adapter.remove(): conflict for ${id} (got _rev ${rev})`);
      }

      await ops.deleteDoc(docRef);
    },

    subscribe(listener: () => void): () => void {
      return ops.onSnapshot(collRef, () => {
        try {
          listener();
        } catch (err) {
          console.error('firestore-adapter subscriber error:', err);
        }
      });
    },
  };

  return adapter;
}

export async function createFirestoreAdapter(config: FirestoreDbConfig): Promise<DbAdapter> {
  const appName = `openpos_${config.projectId}`;
  let app: FirebaseApp;

  const existingApps = getApps();
  const found = existingApps.find((a) => a.name === appName);
  if (found) {
    app = found;
  } else {
    const firebaseOptions: Record<string, string> = {
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
    };
    if (config.storageBucket) {
      firebaseOptions.storageBucket = config.storageBucket;
    }
    if (config.messagingSenderId) {
      firebaseOptions.messagingSenderId = config.messagingSenderId;
    }
    app = initializeApp(firebaseOptions as any, appName);
  }

  const db: Firestore = getFirestore(app);
  const collectionName = config.collectionName || 'openpos_documents';

  return createFirestoreAdapterFromDb(db, collectionName, defaultOperations);
}

// Auto-register in provider registry
registerDatabaseProvider('firestore', createFirestoreAdapter);
