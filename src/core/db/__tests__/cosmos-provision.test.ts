import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testCosmosConnection, ensureCosmosContainer } from '../cosmos-provision';
import type { CosmosDbConfig } from '../config';

const mockGetDatabaseAccount = vi.fn();
const mockContainerCreateIfNotExists = vi.fn();
const mockDatabasesCreateIfNotExists = vi.fn();

vi.mock('@azure/cosmos', () => {
  class MockCosmosClient {
    getDatabaseAccount = mockGetDatabaseAccount;
    databases = {
      createIfNotExists: mockDatabasesCreateIfNotExists,
    };
  }

  return {
    CosmosClient: MockCosmosClient,
  };
});

describe('Cosmos DB Provisioning & Testing', () => {
  const config: CosmosDbConfig = {
    provider: 'cosmos',
    endpoint: 'https://test.documents.azure.com:443/',
    key: 'testKey==',
    databaseId: 'openpos',
    containerId: 'documents',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates connection and returns latency on success', async () => {
    mockGetDatabaseAccount.mockResolvedValueOnce({ id: 'account' });
    const result = await testCosmosConnection(config);
    expect(result.success).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.error).toBeUndefined();
  });

  it('handles connection failure gracefully', async () => {
    mockGetDatabaseAccount.mockRejectedValueOnce(new Error('Unauthorized'));
    const result = await testCosmosConnection(config);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unauthorized');
  });

  it('provisions database and container with default 400 RU/s throughput', async () => {
    mockDatabasesCreateIfNotExists.mockResolvedValueOnce({
      statusCode: 201,
      database: {
        containers: {
          createIfNotExists: mockContainerCreateIfNotExists,
        },
      },
    });
    mockContainerCreateIfNotExists.mockResolvedValueOnce({
      statusCode: 201,
    });

    const result = await ensureCosmosContainer(config);

    expect(mockDatabasesCreateIfNotExists).toHaveBeenCalledWith({ id: 'openpos' });
    expect(mockContainerCreateIfNotExists).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'documents',
        partitionKey: { paths: ['/branchId'] },
        throughput: 400,
      }),
    );
    expect(result.databaseCreated).toBe(true);
    expect(result.containerCreated).toBe(true);
  });
});
