import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import type { FieldDefinition, TypeDefinition, TypeDefinitionDoc } from './definition';
import { SYSTEM_FIELD_KEYS } from './definition';
import { fieldType } from './field-registry';
import { migrateRecordOnRead } from './migration';
import { computeFormulaFields } from './read-model';

/**
 * Phần dùng chung giữa record của entity mới (M1) và document builtin mở rộng (M2).
 *
 * Record (M1) và product (M2) cùng một bài toán: một type definition trong `meta_types`
 * khai báo các field tuỳ chỉnh; tầng lưu phải từ chối khoá lạ, validate giá trị, làm sạch
 * dữ liệu, rồi khi đọc thì lazy-migrate + tính field `formula`. Khác nhau duy nhất là
 * *khoá hệ thống* của entity: record chỉ có khoá envelope, product còn có `basePrice`,
 * `name`… nên hàm nhận thêm `systemKeys`.
 */
export interface CustomFieldBinding {
  /** Type definition cung cấp field tuỳ chỉnh; `null` = type chưa khai báo → không có field tuỳ chỉnh nào. */
  readonly definition: TypeDefinitionDoc | null;
  /**
   * Khoá hệ thống của entity — field tuỳ chỉnh không được trùng và khoá lạ bị từ chối.
   * Khoá envelope (`SYSTEM_FIELD_KEYS`) luôn bị chặn, không cần khai lại ở đây.
   */
  readonly systemKeys: readonly string[];
}

/** Khoá envelope hợp với khoá hệ thống của entity — mọi khoá trong tập này đều bị từ chối. */
function reservedKeys(binding: CustomFieldBinding): ReadonlySet<string> {
  return new Set<string>([...(SYSTEM_FIELD_KEYS as readonly string[]), ...binding.systemKeys]);
}

/** Lỗi nêu tên type khi biết, để thông báo giống hệt đường record của M1. */
function invalidEntity(definition: TypeDefinition | null, message: string): Error {
  if (definition === null) return new Error(message);
  return new Error(`invalid record for type "${definition.key}": ${message}`);
}

/**
 * Từ chối mọi khoá không được khai báo (kể cả khoá hệ thống của envelope).
 *
 * Chạy trên dữ liệu thô của người dùng để lỗi nêu đúng khoá họ vừa gửi, thay vì lặng
 * lẽ bỏ qua.
 */
export function assertNoUndeclaredKeys(
  binding: CustomFieldBinding,
  source: Readonly<Record<string, unknown>>,
): void {
  const { definition } = binding;
  const reserved = reservedKeys(binding);
  const declared = new Set<string>((definition?.fields ?? []).map((field) => field.key));

  for (const key of Object.keys(source)) {
    if (reserved.has(key)) {
      throw invalidEntity(definition, `"${key}" is a system field`);
    }
    if (!declared.has(key)) {
      throw invalidEntity(definition, `field "${key}" is not declared by the type`);
    }
  }
}

/**
 * Validate từng field đã khai báo và trả về dữ liệu đã làm sạch.
 *
 * Field `formula` bị bỏ qua ở cả hai chiều: chúng là dẫn xuất, không bao giờ
 * được lưu (Spec §R1 — bảng dữ liệu không chứa cột tính toán).
 */
export function validateCustomValues(
  definition: TypeDefinition | null,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  if (definition === null) return clean;

  for (const field of definition.fields) {
    if (field.dataType === 'formula') continue;

    const value = values[field.key];
    const issues = fieldType(field.dataType).validate(value, field);
    const first = issues[0];

    if (first !== undefined) {
      throw new Error(
        `invalid record for type "${definition.key}": field "${field.key}": ${first.message}`,
      );
    }
    if (value !== undefined) {
      clean[field.key] = value;
    }
  }

  return clean;
}

/** Chỉ lấy các field dữ liệu đã khai báo từ một document (bỏ envelope + formula). */
export function pickCustomValues(
  definition: TypeDefinition | null,
  source: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (definition === null) return out;

  for (const field of definition.fields) {
    if (field.dataType === 'formula') continue;
    const value = source[field.key];
    if (value !== undefined) out[field.key] = value;
  }

  return out;
}

/**
 * Đọc qua lớp field tuỳ chỉnh: lazy migration theo version của definition rồi tính
 * field `formula`. Trả về document hiệu dụng — formula không bao giờ bị ghi lại.
 */
export async function applyCustomFieldsOnRead(params: {
  readonly adapter: DbAdapter;
  readonly definition: TypeDefinitionDoc;
  readonly doc: DocEnvelope;
  readonly clock: () => string;
}): Promise<Record<string, unknown>> {
  const { adapter, definition, doc, clock } = params;

  const outcome = await migrateRecordOnRead(
    doc,
    definition,
    definition.migrations,
    adapter,
    clock,
  );

  const computed = computeFormulaFields(
    definition,
    outcome.doc as unknown as Record<string, unknown>,
  );

  return { ...outcome.doc, ...computed };
}
