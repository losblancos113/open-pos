import type { DbAdapter } from '../db/adapter';
import type { DocEnvelope } from '../db/envelope';
import type { TypeDefinition } from './definition';
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

/** Lỗi khi registry không nối được `from` → `to` (thiếu bậc, hoặc doc mới hơn định nghĩa). */
export class MigrationChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationChainError';
  }
}

/**
 * Dựng chuỗi bậc thang từ `from` lên `to`.
 *
 * Đi **từng bậc một** (1→2→3), không nhảy cóc: một document tụt hai bậc phải đi qua
 * cả hai phép chuyển, nếu không dữ liệu sẽ bị bỏ qua ở bậc giữa.
 */
export function buildChain(
  registry: readonly TypeMigration[],
  from: number,
  to: number,
): readonly TypeMigration[] {
  if (from === to) return [];
  if (from > to) {
    throw new MigrationChainError(
      `Document schemaVersion ${from} is newer than the type definition version ${to}`,
    );
  }

  const byFromVersion = new Map<number, TypeMigration>();
  for (const step of registry) {
    byFromVersion.set(step.fromVersion, step);
  }

  const chain: TypeMigration[] = [];
  let current = from;

  while (current < to) {
    const step = byFromVersion.get(current);

    if (step === undefined) {
      throw new MigrationChainError(
        `Missing migration step ${current}->${current + 1} in the registry`,
      );
    }
    if (step.toVersion <= step.fromVersion) {
      // Chặn registry hỏng làm vòng lặp chạy mãi.
      throw new MigrationChainError(
        `Migration step ${step.fromVersion}->${step.toVersion} does not advance the version`,
      );
    }

    chain.push(step);
    current = step.toVersion;
  }

  if (current !== to) {
    throw new MigrationChainError(
      `Migration chain overshoots the target version ${to}: reached ${current}`,
    );
  }

  return chain;
}

export interface DataMigrationResult extends TransformResult {
  readonly toVersion: number;
}

/**
 * Chạy toàn bộ chuỗi migration trên phần dữ liệu của một record.
 *
 * Hàm thuần: input không bị sửa. `toVersion` là version sau khi chạy (bằng `to`),
 * kể cả khi không có transform nào thay đổi dữ liệu.
 */
export function migrateData(
  data: Readonly<Record<string, unknown>>,
  registry: readonly TypeMigration[],
  from: number,
  to: number,
): DataMigrationResult {
  const chain = buildChain(registry, from, to);

  let current: Readonly<Record<string, unknown>> = { ...data };
  const applied: string[] = [];

  for (const step of chain) {
    const result = applyTransforms(current, step.transforms);
    current = result.data;
    applied.push(...result.applied);
  }

  return { data: current, applied, toVersion: to };
}

export interface LazyMigrationOutcome<T extends string> {
  readonly doc: DocEnvelope<T>;
  /** Document đã được nâng version (tức là có thay đổi và đã ghi). */
  readonly migrated: boolean;
  /** Đã thực sự gọi `adapter.put`. Hiện bằng `migrated`; tách ra để sau này có dry-run. */
  readonly wrote: boolean;
}

/**
 * Lazy migration: nâng cấp một document ngay lúc đọc.
 *
 * Chỉ ghi khi có thay đổi thật (`applied.length > 0`) — nếu không, mỗi terminal sẽ
 * `put` một cách vô ích và tạo conflict giữa các máy. Transform lỗi thì **không ghi**
 * và ném lỗi ra ngoài để tầng gọi quyết định (Review Focus #5).
 */
export async function migrateRecordOnRead<T extends string>(
  doc: DocEnvelope<T>,
  definition: TypeDefinition,
  registry: readonly TypeMigration[],
  adapter: DbAdapter,
  now: () => string = () => new Date().toISOString(),
): Promise<LazyMigrationOutcome<T>> {
  const to = definition.version;
  const result = migrateData(doc as unknown as Record<string, unknown>, registry, doc.schemaVersion, to);

  if (result.applied.length === 0) {
    return { doc, migrated: false, wrote: false };
  }

  const nextDoc = {
    ...(result.data as unknown as DocEnvelope<T>),
    _id: doc._id,
    _rev: doc._rev,
    docType: doc.docType,
    branchId: doc.branchId,
    createdAt: doc.createdAt,
    schemaVersion: to,
    updatedAt: now(),
  } as DocEnvelope<T>;

  const saved = await adapter.put(nextDoc);
  return { doc: saved as DocEnvelope<T>, migrated: true, wrote: true };
}

export interface BackgroundMigrationProgress {
  readonly scanned: number;
  readonly migrated: number;
  readonly failed: number;
  readonly total: number;
}

function belongsToType(doc: DocEnvelope, definition: TypeDefinition): boolean {
  if (doc.docType === definition.key) return true;
  // Type có sẵn dùng `docType` = baseType; entity mới dùng chính key của nó.
  return definition.baseType !== null && doc.docType === definition.baseType;
}

/**
 * Background migration cho cả collection.
 *
 * Một document hỏng **không** giết cả job: lỗi được đếm vào `failed` rồi đi tiếp,
 * để một bản ghi sai không chặn hàng nghìn bản ghi còn lại.
 */
export async function migrateCollection<T extends string>(
  adapter: DbAdapter,
  definition: TypeDefinition,
  registry: readonly TypeMigration[],
  onProgress?: (progress: BackgroundMigrationProgress) => void,
): Promise<BackgroundMigrationProgress> {
  const all = await adapter.allDocs();
  const targets = all.filter((doc) => belongsToType(doc, definition));

  let scanned = 0;
  let migrated = 0;
  let failed = 0;

  for (const doc of targets) {
    scanned += 1;
    try {
      const outcome = await migrateRecordOnRead(doc as DocEnvelope<T>, definition, registry, adapter);
      if (outcome.wrote) migrated += 1;
    } catch {
      failed += 1;
    }
    onProgress?.({ scanned, migrated, failed, total: targets.length });
  }

  return { scanned, migrated, failed, total: targets.length };
}
