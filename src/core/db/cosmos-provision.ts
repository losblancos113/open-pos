import { CosmosClient } from '@azure/cosmos';
import type { CosmosDbConfig } from './config';

export interface TestConnectionResult {
  success: boolean;
  latencyMs?: number;
  error?: string;
}

export interface EnsureContainerResult {
  databaseCreated: boolean;
  containerCreated: boolean;
}

export interface EnsureContainerOptions {
  throughputRU?: number;
}

export async function testCosmosConnection(
  config: CosmosDbConfig,
): Promise<TestConnectionResult> {
  const startTime = Date.now();
  try {
    const client = new CosmosClient({
      endpoint: config.endpoint,
      key: config.key,
    });

    await client.getDatabaseAccount();
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

export async function ensureCosmosContainer(
  config: CosmosDbConfig,
  options?: EnsureContainerOptions,
): Promise<EnsureContainerResult> {
  const client = new CosmosClient({
    endpoint: config.endpoint,
    key: config.key,
  });

  const throughput = options?.throughputRU ?? 400;
  const partitionKeyPath = config.partitionKeyPath || '/branchId';

  const { database, statusCode: dbStatus } = await client.databases.createIfNotExists({
    id: config.databaseId,
  });

  const { statusCode: containerStatus } = await database.containers.createIfNotExists({
    id: config.containerId,
    partitionKey: {
      paths: [partitionKeyPath],
    },
    throughput,
  });

  return {
    databaseCreated: dbStatus === 201,
    containerCreated: containerStatus === 201,
  };
}
