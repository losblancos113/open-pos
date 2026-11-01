// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDatabaseProvider } from '../useDatabaseProvider';
import { createMemoryAdapter } from '@/core/db/memory-adapter';
import type { CosmosDbConfig } from '@/core/db/config';

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
});
