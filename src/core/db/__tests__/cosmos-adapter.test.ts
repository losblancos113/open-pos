import { describe, it, expect } from 'vitest';
import { describeAdapterContract } from './adapter-contract';
import { createCosmosAdapterFromContainer } from '../cosmos-adapter';
import { createMemoryContainerMock } from './mock-cosmos-container';

describeAdapterContract('CosmosAdapter (via mock container)', {
  create: async () => {
    const mockContainer = createMemoryContainerMock();
    return createCosmosAdapterFromContainer(mockContainer as any);
  },
});
