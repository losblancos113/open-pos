import { createMemoryAdapter } from '../memory-adapter';
import { describeAdapterContract } from './adapter-contract';

describeAdapterContract('memory adapter', {
  create: createMemoryAdapter,
});
