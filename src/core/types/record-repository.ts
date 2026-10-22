import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { recordDocId } from '../db/ids';
import type { TypeDefinitionDoc } from './definition';
import { SYSTEM_FIELD_KEYS } from './definition';
import type { CustomFieldBinding } from './custom-fields';
import {
  applyCustomFieldsOnRead,
  assertNoUndeclaredKeys,
  pickCustomValues,
  validateCustomValues,
} from './custom-fields';
import { createTypeRegistry } from './type-registry';

/**
 * Một record của entity type do người dùng định nghĩa.
 *
 * Ngoài các field envelope cố định, record mang thêm các field dữ liệu tuỳ biến
 * (khoá động) nên cần index signature để tầng gọi truy cập `doc.name` v.v.
 */
export type RecordDocument = DocEnvelope & Readonly<Record<string, unknown>>;

export interface CreateRecordInput {
  readonly typeKey: string;
  readonly branchId: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface UpdateRecordInput {
  readonly typeKey: string;
  readonly id: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly expectedRev: string;
}

export interface ListRecordsOptions {
  readonly branchId?: string;
}

/**
 * Generic CRUD cho record của entity type mới (Spec §R1).
 *
 * Không có code riêng cho từng loại dữ liệu: mọi thứ suy ra từ type definition
 * trong `meta_types`, nên thêm type mới = thêm dữ liệu, không thêm code.
 */
export interface RecordRepository {
  create(input: CreateRecordInput): Promise<RecordDocument>;
  update(input: UpdateRecordInput): Promise<RecordDocument>;
  get(typeKey: string, id: string): Promise<RecordDocument | null>;
  list(typeKey: string, options?: ListRecordsOptions): Promise<readonly RecordDocument[]>;
  /** Soft-delete: document ở lại DB với `deletedAt` để dữ liệu cũ còn truy vết. */
  remove(typeKey: string, id: string, expectedRev: string): Promise<void>;
}

/** Số lần thử lại tối đa khi cấp id tuần tự bị trùng (2 terminal chạy song song). */
const MAX_ID_ATTEMPTS = 5;

function isConflict(error: unknown): boolean {
  return error instanceof Error && /conflict/i.test(error.message);
}

/**
 * `DocEnvelope` không khai báo index signature, nên nó không tự nhận là
 * `Readonly<Record<string, unknown>>` dù record thật sự mang khoá động.
 * Ép kiểu ở đúng ranh giới envelope → record, một chỗ, thay vì rải khắp nơi.
 */
function asRecordDocument(doc: DocEnvelope): RecordDocument {
  return doc as RecordDocument;
}

export function createRecordRepository(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): RecordRepository {
  const registry = createTypeRegistry(adapter, clock);

  async function requireDefinition(typeKey: string): Promise<TypeDefinitionDoc> {
    const definition = await registry.getType(typeKey);
    if (definition === null) {
      throw new Error(`type "${typeKey}" not found`);
    }
    return definition;
  }

  /** Gắn type definition hiện tại vào lớp field tuỳ chỉnh dùng chung. */
  function binding(definition: TypeDefinitionDoc): CustomFieldBinding {
    return { definition, systemKeys: SYSTEM_FIELD_KEYS };
  }

  /**
   * Chạy lazy migration rồi tính field formula trên bản sao.
   *
   * Formula không bao giờ được ghi lại: chúng được tính lại mỗi lần đọc để không
   * bao giờ lệch với dữ liệu nguồn.
   */
  async function readThrough(
    definition: TypeDefinitionDoc,
    doc: DocEnvelope,
  ): Promise<RecordDocument> {
    const effective = await applyCustomFieldsOnRead({ adapter, definition, doc, clock });
    return effective as unknown as RecordDocument;
  }

  /**
   * Số kế tiếp cho id tuần tự, quét mọi record cùng type (mọi chi nhánh) để
   * không tái sử dụng id đã từng tồn tại.
   */
  async function nextSequence(typeKey: string): Promise<number> {
    const all = await adapter.allDocs();
    const prefix = `${typeKey}:`;
    let max = 0;

    for (const doc of all) {
      if (doc.docType !== typeKey) continue;
      const local = doc._id.startsWith(prefix) ? doc._id.slice(prefix.length) : doc._id;
      const match = /^s(\d+)$/.exec(local);
      if (match !== null) {
        max = Math.max(max, Number(match[1]));
      }
    }

    return max + 1;
  }

  return {
    async create({ typeKey, branchId, data }) {
      const definition = await requireDefinition(typeKey);

      assertNoUndeclaredKeys(binding(definition), data);
      const values = validateCustomValues(definition, data);

      const start = await nextSequence(typeKey);

      for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
        const localId = `s${String(start + attempt).padStart(3, '0')}`;
        const envelope = createEnvelope({
          id: recordDocId(typeKey, localId),
          docType: typeKey,
          branchId,
          now: clock(),
        });
        const next: DocEnvelope = {
          ...envelope,
          schemaVersion: definition.version,
          ...values,
        };

        try {
          const saved = await adapter.put(next);
          return await readThrough(definition, saved);
        } catch (error) {
          // Chỉ thử lại khi trùng id; lỗi khác (branchId thiếu, mất kết nối…) ném ngay.
          if (isConflict(error) && attempt < MAX_ID_ATTEMPTS - 1) continue;
          if (isConflict(error)) {
            throw new Error(
              `conflict: could not allocate a unique id for type "${typeKey}" after ${MAX_ID_ATTEMPTS} attempts`,
            );
          }
          throw error;
        }
      }

      // Không tới được đây: vòng lặp trên luôn return hoặc throw.
      throw new Error(`conflict: could not allocate a unique id for type "${typeKey}"`);
    },

    async update({ typeKey, id, data, expectedRev }) {
      const definition = await requireDefinition(typeKey);
      const docId = recordDocId(typeKey, id);

      const existing = await adapter.get(docId);
      if (existing === null || existing.docType !== typeKey) {
        throw new Error(`record "${docId}" not found`);
      }
      if (existing._rev !== expectedRev) {
        throw new Error(
          `conflict: record "${docId}" has _rev ${existing._rev ?? 'undefined'}, expected ${expectedRev}`,
        );
      }

      assertNoUndeclaredKeys(binding(definition), data);

      const merged = {
        ...pickCustomValues(definition, asRecordDocument(existing)),
        ...data,
      };
      const values = validateCustomValues(definition, merged);

      const next: DocEnvelope = {
        _id: existing._id,
        _rev: existing._rev,
        docType: existing.docType,
        branchId: existing.branchId,
        schemaVersion: definition.version,
        createdAt: existing.createdAt,
        updatedAt: clock(),
        ...values,
      };

      const saved = await adapter.put(next);
      return await readThrough(definition, saved);
    },

    async get(typeKey, id) {
      const definition = await registry.getType(typeKey);
      if (definition === null) return null;

      const doc = await adapter.get(recordDocId(typeKey, id));
      if (doc === null || doc.docType !== typeKey) return null;

      return await readThrough(definition, doc);
    },

    async list(typeKey, options) {
      const definition = await registry.getType(typeKey);
      if (definition === null) return [];

      const docs = await adapter.allDocs(
        options?.branchId === undefined ? undefined : { branchId: options.branchId },
      );

      const result: RecordDocument[] = [];
      for (const doc of docs) {
        if (doc.docType !== typeKey) continue;
        result.push(await readThrough(definition, doc));
      }

      return result;
    },

    async remove(typeKey, id, expectedRev) {
      const docId = recordDocId(typeKey, id);
      const existing = await adapter.get(docId);
      if (existing === null || existing.docType !== typeKey) return;

      if (existing._rev !== expectedRev) {
        throw new Error(
          `conflict: record "${docId}" has _rev ${existing._rev ?? 'undefined'}, expected ${expectedRev}`,
        );
      }

      await adapter.put({
        ...existing,
        deletedAt: clock(),
        updatedAt: clock(),
      });
    },
  };
}

