import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createEnvelope } from '../envelope';
import type { DbAdapter } from '../adapter';

/**
 * Hợp đồng hành vi mà MỌI `DbAdapter` phải thoả mãn.
 *
 * Đây là bằng chứng cho tuyên bố "business logic không cần biết đang chạy trên backend nào":
 * cùng một bộ test chạy trên memory adapter (unit test) và PouchDB adapter (thật).
 * Thêm backend mới → cho nó chạy qua đây trước khi viết test riêng.
 *
 * Ghi chú: thứ tự document trong `allDocs()` KHÔNG được quy định — mọi assertion
 * phải sắp xếp trước khi so sánh.
 */
export interface AdapterContractOptions {
  /** Tạo một adapter rỗng cho mỗi test. */
  create(): Promise<DbAdapter>;
  /**
   * Dọn tài nguyên sau mỗi test. Memory adapter không cần.
   * PouchDB cần destroy để nhả handle LevelDB (trên Windows handle còn lại làm rmSync throw).
   */
  destroy?(db: DbAdapter): Promise<void>;
}

export function describeAdapterContract(
  label: string,
  options: AdapterContractOptions,
): void {
  describe(label, () => {
    let db: DbAdapter;

    beforeEach(async () => {
      db = await options.create();
    });

    afterEach(async () => {
      const { destroy } = options;
      if (destroy !== undefined) await destroy(db);
    });

    it('returns null for a missing document', async () => {
      expect(await db.get('product:nope')).toBeNull();
    });

    it('round-trips a document', async () => {
      const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
      const saved = await db.put(doc);
      expect(saved._rev).toBeTruthy();

      const loaded = await db.get('product:p001');
      expect(loaded).toMatchObject({ _id: 'product:p001', docType: 'product', branchId: 'hq' });
    });

    it('bumps _rev on update', async () => {
      const doc = createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' });
      const first = await db.put(doc);
      const second = await db.put({ ...first, updatedAt: '2026-10-20T11:00:00.000Z' });
      expect(second._rev).not.toBe(first._rev);
    });

    it('filters allDocs by branchId', async () => {
      await db.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));
      await db.put(createEnvelope({ id: 'product:p002', docType: 'product', branchId: 'hq' }));
      await db.put(createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'branch2' }));

      const hqDocs = await db.allDocs({ branchId: 'hq' });
      expect(hqDocs.map((d) => d._id).sort()).toEqual(['product:p001', 'product:p002']);
    });

    it('returns every document when no branchId filter is given', async () => {
      await db.put(createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }));
      await db.put(createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'branch2' }));

      const all = await db.allDocs();
      expect(all.map((d) => d._id).sort()).toEqual(['product:p001', 'product:p003']);
    });

    it('removes a document', async () => {
      const doc = await db.put(
        createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      );
      await db.remove('product:p001', doc._rev as string);
      expect(await db.get('product:p001')).toBeNull();
    });

    it('is a no-op when removing a document that does not exist', async () => {
      await expect(db.remove('product:nope', '1-bogus')).resolves.toBeUndefined();
    });

    it('rejects a document without branchId', async () => {
      const doc = {
        ...createEnvelope({ id: 'product:nobranch', docType: 'product', branchId: 'hq' }),
        branchId: '',
      };
      await expect(db.put(doc)).rejects.toThrow(/branchId is required/);
    });

    it('rejects a stale _rev on put', async () => {
      const saved = await db.put(
        createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      );
      await expect(db.put({ ...saved, _rev: '1-bogus' })).rejects.toThrow(/conflict/i);
    });

    it('rejects a put that supplies _rev for a document that does not exist', async () => {
      const ghost = {
        ...createEnvelope({ id: 'product:ghost', docType: 'product', branchId: 'hq' }),
        _rev: '1-bogus',
      };
      await expect(db.put(ghost)).rejects.toThrow(/conflict/i);
    });

    it('rejects a stale _rev on remove', async () => {
      const saved = await db.put(
        createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      );
      expect(saved._rev).toBeTruthy();
      await expect(db.remove('product:p001', '1-bogus')).rejects.toThrow(/conflict/i);
    });

    it('hides soft-deleted documents from get and allDocs', async () => {
      const tombstone = {
        ...createEnvelope({ id: 'product:gone', docType: 'product', branchId: 'hq' }),
        deletedAt: '2026-10-20T12:00:00.000Z',
      };
      await db.put(tombstone);

      expect(await db.get('product:gone')).toBeNull();
      expect((await db.allDocs({ branchId: 'hq' })).map((d) => d._id)).toEqual([]);
    });

    it('writes without any hub or network', async () => {
      // offline-first: ghi phải thành công khi hub đang tắt
      await expect(
        db.put(createEnvelope({ id: 'product:offline', docType: 'product', branchId: 'hq' })),
      ).resolves.toBeTruthy();
    });
  });
}
