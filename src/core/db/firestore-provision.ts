import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';
import type { FirestoreDbConfig } from './config';

export interface TestConnectionResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

export async function testFirestoreConnection(
  config: FirestoreDbConfig,
): Promise<TestConnectionResult> {
  if (!config.apiKey || !config.projectId || !config.appId) {
    return {
      success: false,
      error: 'Missing required Firebase configuration fields (apiKey, projectId, appId)',
    };
  }

  const startTime = Date.now();
  try {
    const appName = `openpos_test_${config.projectId}_${Date.now()}`;
    const existingApps = getApps();
    let app: FirebaseApp;
    const found = existingApps.find((a) => a.name === appName);
    if (found) {
      app = found;
    } else {
      app = initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        },
        appName,
      );
    }

    const db = getFirestore(app);
    const collectionName = config.collectionName || 'openpos_documents';
    const collRef = collection(db, collectionName);

    // Limit to 1 doc to minimize read cost during connection test
    const testQuery = query(collRef, limit(1));
    await getDocs(testQuery);

    const latencyMs = Date.now() - startTime;
    return {
      success: true,
      latencyMs,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
