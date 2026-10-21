import type { DocEnvelope } from '../db/envelope';
import { createEnvelope } from '../db/envelope';
import { typeDocId } from '../db/ids';
import type { TypeMigration } from './migration';

/** Kiểu dữ liệu field được hỗ trợ ở v1 — spec §R1. */
export const DATA_TYPES = [
  'text', 'textarea', 'number', 'decimal', 'money', 'boolean',
  'date', 'datetime', 'select', 'multiselect', 'reference',
  'image', 'color', 'formula',
] as const;

export type DataType = (typeof DATA_TYPES)[number];

/** Nhãn song ngữ. `vi` là mặc định. */
export interface LocalizedText {
  readonly vi: string;
  readonly en: string;
}

export interface FieldOption {
  readonly value: string;
  readonly label: LocalizedText;
}

/**
 * Field tuỳ chỉnh trên một type.
 * `key` không được trùng SYSTEM_FIELD_KEYS và không được bắt đầu bằng `_` — xem definition-validation.
 */
export interface FieldDefinition {
  readonly key: string;
  readonly label: LocalizedText;
  readonly dataType: DataType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  /** Chỉ dùng cho `select` / `multiselect`. */
  readonly options?: readonly FieldOption[];
  /** Chỉ dùng cho `decimal` — số chữ số thập phân (mặc định 2). */
  readonly scale?: number;
  /** Chỉ dùng cho `reference` — key của type được trỏ tới. */
  readonly referenceType?: string;
  /** Chỉ dùng cho `formula` — biểu thức nguồn, ví dụ `price * 0.6`. */
  readonly formula?: string;
  /** Chỉ dùng cho `number` / `decimal` / `money`. */
  readonly min?: number;
  readonly max?: number;
  /** Admin chủ động bật index — Risk #12 giới hạn tổng số. */
  readonly indexed?: boolean;
  readonly ui?: {
    readonly widget?: string;
    readonly group?: string;
  };
}

export type TypeKind = 'builtin_ext' | 'entity';

export interface TypeDefinition {
  readonly key: string;
  readonly kind: TypeKind;
  readonly baseType: string | null;
  readonly name: LocalizedText;
  readonly version: number;
  readonly fields: readonly FieldDefinition[];
  readonly listView: readonly string[];
}

/** Document thật trong collection `meta_types`. */
export type TypeDefinitionDoc = DocEnvelope<'meta_type'> &
  TypeDefinition & {
    /**
     * Lịch sử migration của type này — mỗi bậc version là một phần tử.
     * Bậc thiếu transform vẫn phải tồn tại để chuỗi migration không khuyết.
     */
    readonly migrations: readonly TypeMigration[];
  };

/** Field hệ thống của envelope — field tuỳ chỉnh không được trùng tên. */
export const SYSTEM_FIELD_KEYS = [
  '_id', '_rev', 'docType', 'branchId', 'schemaVersion',
  'createdAt', 'updatedAt', 'deletedAt',
] as const;

export interface CreateTypeDefinitionInput {
  readonly key: string;
  readonly kind: TypeKind;
  readonly baseType: string | null;
  readonly name: LocalizedText;
  readonly branchId: string;
  /** Cho phép bơm thời gian trong test; mặc định lấy giờ hệ thống. */
  readonly now?: string;
}

export function createTypeDefinitionDoc(input: CreateTypeDefinitionInput): TypeDefinitionDoc {
  if (input.kind === 'entity' && input.baseType !== null) {
    throw new Error(
      `createTypeDefinitionDoc(): entity type must have baseType null, got ${input.baseType}`,
    );
  }
  if (input.kind === 'builtin_ext' && (input.baseType === null || input.baseType.trim() === '')) {
    throw new Error('createTypeDefinitionDoc(): builtin_ext type requires a baseType');
  }

  return {
    ...createEnvelope({
      id: typeDocId(input.key),
      docType: 'meta_type',
      branchId: input.branchId,
      // `exactOptionalPropertyTypes` không cho truyền `now: undefined` thẳng.
      ...(input.now === undefined ? {} : { now: input.now }),
    }),
    key: input.key,
    kind: input.kind,
    baseType: input.baseType,
    name: input.name,
    version: 1,
    fields: [],
    listView: [],
    migrations: [],
  };
}
