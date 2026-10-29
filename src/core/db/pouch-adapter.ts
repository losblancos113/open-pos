import type PouchDB from 'pouchdb';
import type { AllDocsOptions, DbAdapter } from './adapter';
import { GLOBAL_BRANCH_ID } from './branch';
import type { DocEnvelope } from './envelope';

/**
 * Adapter PouchDB — backend thật trên terminal (IndexedDB trong WebView2 của Tauri).
 *
 * Chia sẻ cùng bộ test hợp đồng với memory adapter (`__tests__/adapter-contract.ts`),
 * nên business logic không cần biết đang chạy trên backend nào.
 *
 * Ba khác biệt so với memory adapter phải xử lý ở đây:
 *  1. PouchDB báo lỗi bằng exception kèm `status` (404 not_found, 409 conflict)
 *     thay vì giá trị trả về → phải dịch về cùng ngữ nghĩa.
 *  2. PouchDB giữ tombstone trong `_all_docs` sau `remove()` → phải lọc bỏ.
 *  3. `deletedAt` (soft-delete ở tầng ứng dụng) không được PouchDB biết → phải lọc bỏ.
 */

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** PouchDB ném lỗi kèm `status`; lỗi khác (TypeError…) không có. */
function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function requireBranchId(doc: DocEnvelope): void {
  if (typeof doc.branchId !== 'string' || doc.branchId.trim() === '') {
    throw new Error(
      'pouch-adapter.put(): branchId is required on every document (see design doc Risk #17)',
    );
  }
}

/**
 * Nhận một `PouchDB.Database` đã mở (do app/terminal sở hữu vòng đời) và bọc nó
 * sau interface `DbAdapter`.
 *
 * Async để đồng bộ chữ ký với `createMemoryAdapter()`, và để sau này có thể `await`
 * việc tạo index mà không phải đổi API.
 */
export async function createPouchAdapter(db: PouchDB.Database): Promise<DbAdapter> {
  const listeners = new Set<() => void>();

  function notifyListeners() {
    for (const listener of listeners) {
      try {
        listener();
      } catch (err) {
        console.error('pouch-adapter subscriber error:', err);
      }
    }
  }

  try {
    if (typeof (db as unknown as { changes?: unknown }).changes === 'function') {
      db.changes({
        since: 'now',
        live: true,
      }).on('change', () => {
        notifyListeners();
      });
    }
  } catch (err) {
    console.warn('pouch-adapter: db.changes not available, using in-process notifications only:', err);
  }

  const adapter: DbAdapter = {
    async get(id) {
      let raw: unknown;
      try {
        raw = await db.get(id);
      } catch (error) {
        if (statusOf(error) === HTTP_NOT_FOUND) return null;
        throw error;
      }

      const doc = raw as DocEnvelope;
      if (doc.deletedAt !== undefined) return null;
      return { ...doc };
    },

    async put(doc) {
      requireBranchId(doc);

      let rev: string;
      try {
        const result = await db.put({ ...doc });
        rev = result.rev;
      } catch (error) {
        if (statusOf(error) === HTTP_CONFLICT) {
          throw new Error(
            `pouch-adapter.put(): conflict for ${doc._id} (got _rev ${doc._rev ?? 'undefined'})`,
          );
        }
        throw error;
      }

      notifyListeners();
      return { ...doc, _rev: rev };
    },

    async allDocs(options?: AllDocsOptions) {
      const response = await db.allDocs({ include_docs: true });
      const branchId = options?.branchId;
      const includeGlobal = options?.includeGlobal === true;
      const out: DocEnvelope[] = [];

      for (const row of response.rows) {
        // Tombstone sau remove(): tuỳ adapter, PouchDB có thể trả `value.deleted = true`
        // kèm `doc = null` thay vì bỏ hẳn row — lọc cả hai để không phụ thuộc chi tiết đó.
        if (row.value.deleted === true) continue;
        const raw = row.doc;
        if (raw === null || raw === undefined) continue;

        const doc = raw as DocEnvelope;
        if (doc.deletedAt !== undefined) continue;

        if (branchId !== undefined && doc.branchId !== branchId) {
          if (!(includeGlobal && doc.branchId === GLOBAL_BRANCH_ID)) continue;
        }

        out.push({ ...doc });
      }

      return out;
    },

    async remove(id, rev) {
      try {
        await db.remove(id, rev);
        notifyListeners();
      } catch (error) {
        const status = statusOf(error);
        // Xoá document không tồn tại là no-op (giống memory adapter)
        if (status === HTTP_NOT_FOUND) return;
        if (status === HTTP_CONFLICT) {
          throw new Error(`pouch-adapter.remove(): conflict for ${id} (got _rev ${rev})`);
        }
        throw error;
      }
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return adapter;
}
