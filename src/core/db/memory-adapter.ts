import type { DbAdapter } from './adapter';
import { GLOBAL_BRANCH_ID } from './branch';
import type { DocEnvelope } from './envelope';

/**
 * Adapter in-memory: dùng cho unit test và cho chế độ dev không cần hub.
 * Cố tình giữ ngữ nghĩa giống PouchDB (đồng bộ API, _rev tăng dần) để có thể
 * hoán đổi adapter mà không phải sửa test hay business logic.
 */
export function createMemoryAdapter(): Promise<DbAdapter> {
  const store = new Map<string, DocEnvelope>();
  const listeners = new Set<() => void>();
  let revCounter = 0;

  function notifyListeners() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error('memory-adapter subscriber error:', err);
      }
    }
  }

  function nextRev(): string {
    revCounter += 1;
    return `1-${revCounter.toString(16).padStart(8, '0')}`;
  }

  const adapter: DbAdapter = {
    async get(id) {
      const doc = store.get(id);
      if (!doc || doc.deletedAt !== undefined) return null;
      return { ...doc };
    },

    async put(doc) {
      if (typeof doc.branchId !== 'string' || doc.branchId.trim() === '') {
        throw new Error('memory-adapter.put(): branchId is required (see design doc Risk #17)');
      }

      const existing = store.get(doc._id);

      if (existing && existing._rev !== doc._rev) {
        throw new Error(
          `conflict: document ${doc._id} has _rev ${existing._rev}, got ${doc._rev ?? 'undefined'}`,
        );
      }
      if (!existing && doc._rev) {
        throw new Error(`conflict: document ${doc._id} does not exist but _rev was provided`);
      }

      const saved: DocEnvelope = { ...doc, _rev: nextRev() };
      store.set(saved._id, saved);
      notifyListeners();
      return { ...saved };
    },

    async allDocs(options) {
      const docs = [...store.values()].filter((d) => d.deletedAt === undefined);
      const branchId = options?.branchId;

      if (branchId === undefined) return docs.map((d) => ({ ...d }));

      const includeGlobal = options?.includeGlobal === true;
      return docs
        .filter(
          (d) => d.branchId === branchId || (includeGlobal && d.branchId === GLOBAL_BRANCH_ID),
        )
        .map((d) => ({ ...d }));
    },

    async remove(id, rev) {
      const existing = store.get(id);
      if (!existing) return;
      if (existing._rev !== rev) {
        throw new Error(`conflict: document ${id} has _rev ${existing._rev}, got ${rev}`);
      }
      store.delete(id);
      notifyListeners();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return Promise.resolve(adapter);
}
