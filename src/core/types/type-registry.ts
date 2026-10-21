import type { DbAdapter } from '../db/adapter';
import { typeDocId } from '../db/ids';
import type {
  CreateTypeDefinitionInput,
  FieldDefinition,
  LocalizedText,
  TypeDefinitionDoc,
  TypeKind,
} from './definition';
import { createTypeDefinitionDoc } from './definition';
import { assertValidTypeDefinition } from './definition-validation';
import type { MigrationTransform, TypeMigration } from './migration';

/** Input của `createType` — input factory, cộng thêm fields/listView. */
export type CreateTypeInput = Omit<CreateTypeDefinitionInput, 'now'> & {
  readonly fields?: readonly FieldDefinition[];
  readonly listView?: readonly string[];
};

/** Patch của `updateType`. Chỉ những gì được phép đổi; key/kind/baseType là bất biến. */
export interface UpdateTypeInput {
  readonly name?: LocalizedText;
  readonly fields?: readonly FieldDefinition[];
  readonly listView?: readonly string[];
  /** Transform khai báo cho bậc version mới. Bỏ qua nếu version không tăng. */
  readonly migration?: readonly MigrationTransform[];
}

export interface UpdateTypeOptions {
  /** `_rev` mà client đang thấy. Lệch → lỗi conflict thay vì ghi đè im lặng. */
  readonly expectedRev?: string;
}

export interface ListTypesOptions {
  readonly kind?: TypeKind;
}

export interface TypeRegistry {
  createType(input: CreateTypeInput): Promise<TypeDefinitionDoc>;
  getType(key: string): Promise<TypeDefinitionDoc | null>;
  listTypes(options?: ListTypesOptions): Promise<readonly TypeDefinitionDoc[]>;
  updateType(
    key: string,
    patch: UpdateTypeInput,
    options?: UpdateTypeOptions,
  ): Promise<TypeDefinitionDoc>;
  /** Soft-delete: document ở lại trong DB vì dữ liệu cũ vẫn tham chiếu type. */
  deleteType(key: string): Promise<void>;
}

const CONFLICT = /conflict/i;

function isConflict(error: unknown): boolean {
  return error instanceof Error && CONFLICT.test(error.message);
}

/**
 * So sánh cấu trúc cho patch.
 *
 * Không dùng `JSON.stringify` vì thứ tự key phụ thuộc cách dựng object: form admin
 * dựng lại field theo thứ tự khác sẽ bị coi là "đổi" và bump version oan.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

/** `undefined` nghĩa là "không đụng tới field này", không phải "xoá nó". */
function changed(next: unknown, current: unknown): boolean {
  return next !== undefined && !deepEqual(next, current);
}

/**
 * Registry quản lý `meta_types` — CRUD + versioning.
 *
 * Bất biến quan trọng: `version` chỉ tăng khi *shape* của type đổi (fields/listView).
 * Đổi mỗi nhãn hiển thị không tạo bậc mới, nên không sinh migration rỗng.
 */
export function createTypeRegistry(
  adapter: DbAdapter,
  clock: () => string = () => new Date().toISOString(),
): TypeRegistry {
  async function readDefinition(id: string): Promise<TypeDefinitionDoc | null> {
    const doc = await adapter.get(id);
    if (doc === null) return null;
    // Phòng thủ: id đúng nhưng docType lạ thì không phải type definition.
    if (doc.docType !== 'meta_type') return null;
    return doc as TypeDefinitionDoc;
  }

  async function requireDefinition(id: string, key: string): Promise<TypeDefinitionDoc> {
    const doc = await readDefinition(id);
    if (doc === null) {
      throw new Error(`Type ${key} not found`);
    }
    return doc;
  }

  return {
    async createType(input) {
      const id = typeDocId(input.key);
      const { fields, listView, ...definitionInput } = input;

      const doc: TypeDefinitionDoc = {
        ...createTypeDefinitionDoc({ ...definitionInput, now: clock() }),
        fields: [...(fields ?? [])],
        listView: [...(listView ?? [])],
      };

      assertValidTypeDefinition(doc);

      if ((await readDefinition(id)) !== null) {
        throw new Error(`Type ${input.key} already exists`);
      }

      try {
        const saved = await adapter.put(doc);
        return saved as TypeDefinitionDoc;
      } catch (error) {
        // `get` ẩn document đã soft-delete, nhưng adapter vẫn giữ nó trong store.
        // Ghi đè lên nó sẽ làm version tụt về 1 trong khi record cũ vẫn ở version cao hơn,
        // khiến chuỗi migration khuyết bậc — nên từ chối thẳng thay vì để lỗi conflict thô.
        if (isConflict(error)) {
          throw new Error(
            `Type ${input.key} already exists — its id is still occupied, possibly by a deleted type`,
          );
        }
        throw error;
      }
    },

    getType(key) {
      return readDefinition(typeDocId(key));
    },

    async listTypes(options) {
      const docs = await adapter.allDocs();
      return docs
        .filter((doc) => doc.docType === 'meta_type')
        .map((doc) => doc as TypeDefinitionDoc)
        .filter((doc) => options?.kind === undefined || doc.kind === options.kind)
        .sort((a, b) => a.key.localeCompare(b.key));
    },

    async updateType(key, patch, options) {
      const id = typeDocId(key);
      const current = await requireDefinition(id, key);

      if (options?.expectedRev !== undefined && current._rev !== options.expectedRev) {
        throw new Error(
          `conflict: type ${key} has _rev ${current._rev ?? 'undefined'}, expected ${options.expectedRev}`,
        );
      }

      const bumped = changed(patch.fields, current.fields) || changed(patch.listView, current.listView);
      const version = bumped ? current.version + 1 : current.version;
      const history = current.migrations ?? [];

      const migrations: readonly TypeMigration[] = bumped
        ? [
            ...history,
            {
              fromVersion: current.version,
              toVersion: version,
              transforms: [...(patch.migration ?? [])],
            },
          ]
        : history;

      const next: TypeDefinitionDoc = {
        ...current,
        name: patch.name ?? current.name,
        fields: patch.fields ? [...patch.fields] : current.fields,
        listView: patch.listView ? [...patch.listView] : current.listView,
        version,
        migrations,
        updatedAt: clock(),
      };

      assertValidTypeDefinition(next);

      const saved = await adapter.put(next);
      return saved as TypeDefinitionDoc;
    },

    async deleteType(key) {
      const current = await readDefinition(typeDocId(key));
      if (current === null) return;
      await adapter.put({ ...current, deletedAt: clock(), updatedAt: clock() });
    },
  };
}
