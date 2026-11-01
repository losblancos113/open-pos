import { describe, it, expect, vi } from 'vitest';
import { createMemoryAdapter } from '../memory-adapter';
import { createEnvelope } from '../envelope';
import { migrateAdapterData } from '../migration';
import type { DbAdapter } from '../adapter';

describe('Throttled Data Migration', () => {
  it('migrates all documents from source to target in chunks', async () => {
    const source = await createMemoryAdapter();
    const target = await createMemoryAdapter();

    for (let i = 0; i < 25; i++) {
      await source.put(createEnvelope({ id: `item:${i}`, docType: 'item', branchId: 'hq' }));
    }

    const progressUpdates: number[] = [];
    const result = await migrateAdapterData(source, target, {
      batchSize: 10,
      delayBetweenBatchesMs: 5,
      onProgress: (p) => progressUpdates.push(p.transferred),
    });

    expect(result.total).toBe(25);
    expect(result.transferred).toBe(25);
    expect(result.failed).toBe(0);
    expect(result.isComplete).toBe(true);

    const targetDocs = await target.allDocs();
    expect(targetDocs.length).toBe(25);
    expect(progressUpdates.length).toBeGreaterThan(0);
  });

  it('retries and succeeds when target returns HTTP 429 rate-limit error', async () => {
    const source = await createMemoryAdapter();
    const target = await createMemoryAdapter();

    await source.put(createEnvelope({ id: 'item:retry-test', docType: 'item', branchId: 'hq' }));

    let attempts = 0;
    const originalPut = target.put.bind(target);
    target.put = async (doc) => {
      attempts++;
      if (attempts === 1) {
        const err = new Error('RequestRateTooLarge');
        (err as any).statusCode = 429;
        (err as any).retryAfterInMilliseconds = 10;
        throw err;
      }
      return originalPut(doc);
    };

    const result = await migrateAdapterData(source, target, {
      batchSize: 5,
      delayBetweenBatchesMs: 5,
      maxRetries: 3,
    });

    expect(attempts).toBe(2);
    expect(result.transferred).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.isComplete).toBe(true);
  });
});
