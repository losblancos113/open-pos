import type { DbAdapter } from './adapter';
import type { DocEnvelope } from './envelope';

export interface MigrationProgress {
  total: number;
  transferred: number;
  failed: number;
  isComplete: boolean;
  error?: string;
}

export interface MigrationOptions {
  batchSize?: number;
  delayBetweenBatchesMs?: number;
  maxRetries?: number;
  onProgress?: (progress: MigrationProgress) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err: unknown): { isRateLimit: boolean; retryAfterMs?: number } {
  if (typeof err !== 'object' || err === null) {
    return { isRateLimit: false };
  }
  const anyErr = err as {
    statusCode?: unknown;
    code?: unknown;
    status?: unknown;
    retryAfterInMilliseconds?: unknown;
  };
  const status = anyErr.statusCode ?? anyErr.code ?? anyErr.status;
  const isRateLimit = status === 429;
  const retryAfterMs =
    typeof anyErr.retryAfterInMilliseconds === 'number'
      ? anyErr.retryAfterInMilliseconds
      : undefined;

  return { isRateLimit, retryAfterMs };
}

async function putWithRetry(
  target: DbAdapter,
  doc: DocEnvelope,
  maxRetries: number,
): Promise<boolean> {
  let attempts = 0;

  while (attempts <= maxRetries) {
    try {
      // Check if doc already exists on target to use correct _rev
      const existing = await target.get(doc._id);
      let toPut: DocEnvelope;
      if (existing && existing._rev) {
        toPut = { ...doc, _rev: existing._rev };
      } else {
        const docCopy = { ...doc };
        delete (docCopy as any)._rev;
        toPut = docCopy;
      }

      await target.put(toPut);
      return true;
    } catch (err) {
      const { isRateLimit, retryAfterMs } = isRateLimitError(err);
      if (isRateLimit && attempts < maxRetries) {
        attempts++;
        const backoff = retryAfterMs ?? Math.min(100 * Math.pow(2, attempts), 2000);
        await sleep(backoff);
        continue;
      }
      return false;
    }
  }

  return false;
}

export async function migrateAdapterData(
  source: DbAdapter,
  target: DbAdapter,
  options?: MigrationOptions,
): Promise<MigrationProgress> {
  const batchSize = options?.batchSize ?? 10;
  const delayMs = options?.delayBetweenBatchesMs ?? 100;
  const maxRetries = options?.maxRetries ?? 3;
  const onProgress = options?.onProgress;

  const docs = await source.allDocs();
  const progress: MigrationProgress = {
    total: docs.length,
    transferred: 0,
    failed: 0,
    isComplete: false,
  };

  onProgress?.(progress);

  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);

    for (const doc of chunk) {
      const success = await putWithRetry(target, doc, maxRetries);
      if (success) {
        progress.transferred++;
      } else {
        progress.failed++;
      }
    }

    onProgress?.(progress);

    if (i + batchSize < docs.length && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  progress.isComplete = true;
  onProgress?.(progress);

  return progress;
}
