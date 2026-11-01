// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDatabaseProvider } from '../useDatabaseProvider';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import type { CosmosDbConfig, FirestoreDbConfig } from '@/core/db/config';

vi.mock('@/core/db/cosmos-adapter', () => {
  return {
    createCosmosAdapter: vi.fn().mockImplementation(async (config: CosmosDbConfig) => {
      if (config.key === 'invalid') {
        throw new Error('Invalid Cosmos credentials');
      }
      return createMemoryAdapter();
    }),
  };
});

vi.mock('@/core/db/firestore-adapter', () => {
  return {
    createFirestoreAdapter: vi.fn().mockImplementation(async (config: FirestoreDbConfig) => {
      if (config.apiKey === 'invalid') {
        throw new Error('Invalid Firebase credentials');
      }
      return createMemoryAdapter();
    }),
  };
});

describe('useDatabaseProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('initializes with default local configuration', () => {
    const { activeConfig, providerStatus } = useDatabaseProvider();
    expect(activeConfig.value.provider).toBe('local');
    expect(providerStatus.value).toBe('local');
  });

  it('switches provider to cosmos successfully', async () => {
    const { activeConfig, providerStatus, switchProvider } = useDatabaseProvider();
    const cosmosConfig: CosmosDbConfig = {
      provider: 'cosmos',
      endpoint: 'https://test.documents.azure.com:443/',
      key: 'validKey==',
      databaseId: 'openpos',
      containerId: 'documents',
    };

    const newAdapter = await switchProvider(cosmosConfig);

    expect(newAdapter).toBeDefined();
    expect(activeConfig.value.provider).toBe('cosmos');
    expect(providerStatus.value).toBe('connected');
  });

  it('sets error state when switching to invalid cosmos config', async () => {
    const { activeConfig, providerStatus, statusMessage, switchProvider } = useDatabaseProvider();
    const badConfig: CosmosDbConfig = {
      provider: 'cosmos',
      endpoint: 'https://test.documents.azure.com:443/',
      key: 'invalid',
      databaseId: 'openpos',
      containerId: 'documents',
    };

    await expect(switchProvider(badConfig)).rejects.toThrow('Invalid Cosmos credentials');
    expect(providerStatus.value).toBe('error');
    expect(statusMessage.value).toContain('Invalid Cosmos credentials');
  });

  it('switches provider to firestore successfully', async () => {
    const { activeConfig, providerStatus, switchProvider } = useDatabaseProvider();
    const firestoreConfig: FirestoreDbConfig = {
      provider: 'firestore',
      apiKey: 'AIzaSy123',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      appId: '1:123:web:456',
    };

    const newAdapter = await switchProvider(firestoreConfig);

    expect(newAdapter).toBeDefined();
    expect(activeConfig.value.provider).toBe('firestore');
    expect(providerStatus.value).toBe('connected');
  });

  it('sets error state when switching to invalid firestore config', async () => {
    const { activeConfig, providerStatus, statusMessage, switchProvider } = useDatabaseProvider();
    const badConfig: FirestoreDbConfig = {
      provider: 'firestore',
      apiKey: 'invalid',
      authDomain: 'test.firebaseapp.com',
      projectId: 'test-project',
      appId: '1:123:web:456',
    };

    await expect(switchProvider(badConfig)).rejects.toThrow('Invalid Firebase credentials');
    expect(providerStatus.value).toBe('error');
    expect(statusMessage.value).toContain('Invalid Firebase credentials');
  });
});
