import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testFirestoreConnection } from '../firestore-provision';
import type { FirestoreDbConfig } from '../config';

const mockGetDocs = vi.fn();

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn().mockReturnValue({}),
  getApps: vi.fn().mockReturnValue([]),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn().mockReturnValue({}),
  collection: vi.fn().mockReturnValue({}),
  query: vi.fn().mockReturnValue({}),
  limit: vi.fn().mockReturnValue({}),
  getDocs: (...args: any[]) => mockGetDocs(...args),
}));

describe('testFirestoreConnection', () => {
  const validConfig: FirestoreDbConfig = {
    provider: 'firestore',
    apiKey: 'AIzaValidKey',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project',
    appId: '1:123:web:abc',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success and latency for valid config', async () => {
    mockGetDocs.mockResolvedValueOnce({ docs: [] });
    const result = await testFirestoreConnection(validConfig);
    expect(result.success).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.error).toBeUndefined();
  });

  it('handles connection / query failure gracefully', async () => {
    mockGetDocs.mockRejectedValueOnce(new Error('Permission denied'));
    const result = await testFirestoreConnection(validConfig);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });

  it('rejects invalid or missing required credentials', async () => {
    const invalidConfig = {
      provider: 'firestore' as const,
      apiKey: '',
      authDomain: '',
      projectId: '',
      appId: '',
    };
    const result = await testFirestoreConnection(invalidConfig);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
