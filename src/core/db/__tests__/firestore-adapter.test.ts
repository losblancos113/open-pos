import { describe } from 'vitest';
import { describeAdapterContract } from './adapter-contract';
import { createFirestoreAdapterFromDb } from '../firestore-adapter';
import { createMockFirestoreDb } from './mock-firestore';

describeAdapterContract('FirestoreAdapter (via mock Firestore db)', {
  create: async () => {
    const mockDb = createMockFirestoreDb();
    return createFirestoreAdapterFromDb(mockDb as any, 'openpos_documents', mockDb.ops as any);
  },
});
