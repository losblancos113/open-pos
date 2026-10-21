import { SYSTEM_FIELD_KEYS } from './definition';

/**
 * Một bước chuyển dữ liệu khai báo được, không dùng `eval`.
 *
 * Migration ở v1 là **khai báo**, không phải code chạy: admin đổi type thì hệ thống
 * biết chính xác cần chuyển gì, và có thể chạy lại nhiều lần mà không hỏng dữ liệu.
 */
export type MigrationTransform =
  | { readonly kind: 'rename'; readonly from: string; readonly to: string }
  | { readonly kind: 'addDefault'; readonly field: string; readonly value: unknown }
  | {
      readonly kind: 'mapValue';
      readonly field: string;
      readonly map: Readonly<Record<string, unknown>>;
      readonly fallback?: unknown;
    }
  | { readonly kind: 'removeField'; readonly field: string };

export type MigrationErrorCode =
  | 'rename_target_exists'
  | 'unmapped_value'
  | 'reserved_field'
  | 'unknown_transform';

export class MigrationError extends Error {
  readonly code: MigrationErrorCode;

  constructor(code: MigrationErrorCode, message: string) {
    super(message);
    this.name = 'MigrationError';
    this.code = code;
  }
}

/** Một chặng migration giữa hai version liền kề của một type. */
export interface TypeMigration {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly transforms: readonly MigrationTransform[];
}

export interface TransformResult {
  /** Bản dữ liệu mới — input không bị sửa. */
  readonly data: Readonly<Record<string, unknown>>;
  /** Nhãn các transform **thực sự** thay đổi dữ liệu, theo thứ tự chạy. */
  readonly applied: readonly string[];
}

const RESERVED = SYSTEM_FIELD_KEYS as readonly string[];

function assertNotReserved(field: string, transform: string): void {
  if (field.startsWith('_') || RESERVED.includes(field)) {
    throw new MigrationError(
      'reserved_field',
      `Migration transform ${transform} must not touch reserved system field ${JSON.stringify(field)}`,
    );
  }
}

/** Nhãn dùng cho `TransformResult.applied` — cũng là dấu vết để debug migration. */
export function transformLabel(transform: MigrationTransform): string {
  switch (transform.kind) {
    case 'rename':
      return `rename:${transform.from}->${transform.to}`;
    case 'addDefault':
      return `addDefault:${transform.field}`;
    case 'mapValue':
      return `mapValue:${transform.field}`;
    case 'removeField':
      return `removeField:${transform.field}`;
  }
}

function hasOwn(target: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

function applyOne(
  data: Readonly<Record<string, unknown>>,
  transform: MigrationTransform,
): { readonly data: Record<string, unknown>; readonly changed: boolean } {
  const next: Record<string, unknown> = { ...data };

  switch (transform.kind) {
    case 'rename': {
      const { from, to } = transform;
      assertNotReserved(from, 'rename');
      assertNotReserved(to, 'rename');

      if (!hasOwn(next, from)) return { data: next, changed: false };
      if (hasOwn(next, to)) {
        throw new MigrationError(
          'rename_target_exists',
          `rename(${from} -> ${to}) refused: target field ${JSON.stringify(to)} already exists`,
        );
      }

      next[to] = next[from];
      delete next[from];
      return { data: next, changed: true };
    }

    case 'addDefault': {
      assertNotReserved(transform.field, 'addDefault');
      // Chỉ điền khi field **chưa tồn tại** — giá trị admin đã nhập không bị ghi đè.
      if (hasOwn(next, transform.field)) return { data: next, changed: false };
      next[transform.field] = transform.value;
      return { data: next, changed: true };
    }

    case 'mapValue': {
      assertNotReserved(transform.field, 'mapValue');
      if (!hasOwn(next, transform.field)) return { data: next, changed: false };

      const current = next[transform.field];
      const key = String(current);

      if (hasOwn(transform.map, key)) {
        next[transform.field] = transform.map[key];
        return { data: next, changed: true };
      }

      if ('fallback' in transform && transform.fallback !== undefined) {
        next[transform.field] = transform.fallback;
        return { data: next, changed: true };
      }

      throw new MigrationError(
        'unmapped_value',
        `mapValue(${transform.field}) has no mapping for value ${JSON.stringify(current)} and no fallback was declared`,
      );
    }

    case 'removeField': {
      assertNotReserved(transform.field, 'removeField');
      if (!hasOwn(next, transform.field)) return { data: next, changed: false };
      delete next[transform.field];
      return { data: next, changed: true };
    }

    default: {
      const unknown = transform as { readonly kind: string };
      throw new MigrationError(
        'unknown_transform',
        `Unknown migration transform ${JSON.stringify(unknown.kind)}`,
      );
    }
  }
}

/**
 * Chạy một chuỗi transform trên dữ liệu record.
 *
 * **Hàm thuần**: luôn trả object mới, không bao giờ sửa `data` truyền vào — adapter
 * giữ bản gốc để có thể ghi lại hoặc chạy lại migration (idempotent).
 *
 * `applied` chỉ liệt kê transform **thực sự** thay đổi dữ liệu: một rename trỏ tới field
 * không tồn tại, hay removeField trên key đã sạch, đều không xuất hiện. Nhờ vậy tầng trên
 * biết được lần chạy này có cần ghi hay không (Review Focus #5).
 */
export function applyTransforms(
  data: Readonly<Record<string, unknown>>,
  transforms: readonly MigrationTransform[],
): TransformResult {
  let current: Readonly<Record<string, unknown>> = { ...data };
  const applied: string[] = [];

  for (const transform of transforms) {
    const result = applyOne(current, transform);
    current = result.data;
    if (result.changed) applied.push(transformLabel(transform));
  }

  return { data: current, applied };
}
