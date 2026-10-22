import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { recordDocId } from '../db/ids';
import type { TypeDefinition, TypeDefinitionDoc } from './definition';
import { SYSTEM_FIELD_KEYS } from './definition';
import { fieldType } from './field-registry';
import { migrateRecordOnRead } from './migration';
import { computeFormulaFields } from './read-model';
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

function isSystemFieldKey(key: string): boolean {
  return (SYSTEM_FIELD_KEYS as readonly string[]).includes(key);
}

function validationError(typeKey: string, fieldKey: string, message: string): Error {
  return new Error(`invalid record for type "${typeKey}": field "${fieldKey}": ${message}`);
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

  /**
   * Từ chối mọi khoá không được type khai báo (kể cả field hệ thống).
   *
   * Chạy trên dữ liệu thô của người dùng để lỗi nêu đúng khoá họ vừa gửi,
   * thay vì lặng lẽ bỏ qua.
   */
  function assertNoUndeclaredKeys(
    definition: TypeDefinition,
    source: Readonly<Record<string, unknown>>,
  ): void {
    const declared = new Set(definition.fields.map((field) => field.key));

    for (const key of Object.keys(source)) {
      if (isSystemFieldKey(key)) {
        throw new Error(`invalid record for type "${definition.key}": "${key}" is a system field`);
      }
      if (!declared.has(key)) {
        throw new Error(
          `invalid record for type "${definition.key}": field "${key}" is not declared by the type`,
        );
      }
    }
  }

  /**
   * Validate từng field đã khai báo và trả về dữ liệu đã làm sạch.
   *
   * Field `formula` bị bỏ qua ở cả hai chiều: chúng là dẫn xuất, không bao giờ
   * được lưu (Spec §R1 — bảng dữ liệu không chứa cột tính toán).
   */
  function validateFieldValues(
    definition: TypeDefinition,
    values: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const clean: Record<string, unknown> = {};

    for (const field of definition.fields) {
      if (field.dataType === 'formula') continue;

      const value = values[field.key];
      const issues = fieldType(field.dataType).validate(value, field);
      const first = issues[0];

      if (first !== undefined) {
        throw validationError(definition.key, field.key, first.message);
      }
      if (value !== undefined) {
        clean[field.key] = value;
      }
    }

    return clean;
  }

  /** Chỉ lấy các field dữ liệu đã khai báo từ một document (bỏ envelope + formula). */
  function pickDataFields(
    definition: TypeDefinition,
    source: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    for (const field of definition.fields) {
      if (field.dataType === 'formula') continue;
      const value = source[field.key];
      if (value !== undefined) out[field.key] = value;
    }

    return out;
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
    const outcome = await migrateRecordOnRead(
      doc,
      definition,
      definition.migrations,
      adapter,
      clock,
    );
    const computed = computeFormulaFields(definition, asRecordDocument(outcome.doc));
    return { ...outcome.doc, ...computed };
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

      assertNoUndeclaredKeys(definition, data);
      const values = validateFieldValues(definition, data);

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

      assertNoUndeclaredKeys(definition, data);

      const merged = { ...pickDataFields(definition, asRecordDocument(existing)), ...data };
      const values = validateFieldValues(definition, merged);

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

