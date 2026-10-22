import type { FieldDefinition, TypeDefinition } from './definition';
import { DATA_TYPES, SYSTEM_FIELD_KEYS } from './definition';
import { parseFormula } from './formula';

/** Risk #12: nhiều index hơn thế này sẽ làm chậm ghi và phình dữ liệu local. */
export const MAX_INDEXED_FIELDS = 5;

/** Field type tham gia được vào formula — phải khớp quyết định D4 và `formulaValueOf`. */
const FORMULA_FIELD_TYPES = ['number', 'decimal', 'money', 'boolean', 'formula'] as const;

export type DefinitionValidationCode =
  | 'reserved_key'
  | 'duplicate_key'
  | 'unknown_data_type'
  | 'missing_options'
  | 'duplicate_option'
  | 'missing_reference_type'
  | 'too_many_indexed'
  | 'unknown_list_field'
  | 'unknown_field'
  | 'formula_cycle'
  | 'formula_unsupported_type'
  | 'formula_syntax';

export interface DefinitionValidationIssue {
  readonly path: string;
  readonly code: DefinitionValidationCode;
  readonly message: string;
}

function issue(
  path: string,
  code: DefinitionValidationCode,
  message: string,
): DefinitionValidationIssue {
  return { path, code, message };
}

function isReservedKey(key: string, extra: readonly string[]): boolean {
  return (
    key.startsWith('_') ||
    (SYSTEM_FIELD_KEYS as readonly string[]).includes(key) ||
    extra.includes(key)
  );
}

function isKnownDataType(dataType: string): boolean {
  return (DATA_TYPES as readonly string[]).includes(dataType);
}

function canParticipateInFormula(field: FieldDefinition): boolean {
  return (FORMULA_FIELD_TYPES as readonly string[]).includes(field.dataType);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function validateFieldKeys(
  fields: readonly FieldDefinition[],
  reservedKeys: readonly string[],
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const declared = new Set<string>();

  for (const field of fields) {
    const key = field.key;

    if (isReservedKey(key, reservedKeys)) {
      issues.push(
        issue(
          key,
          'reserved_key',
          `Field key ${JSON.stringify(key)} is reserved: system fields and keys starting with "_" are not allowed`,
        ),
      );
    }

    if (declared.has(key)) {
      issues.push(
        issue(key, 'duplicate_key', `Field key ${JSON.stringify(key)} is declared more than once`),
      );
    }
    declared.add(key);
  }

  return issues;
}

function validateFieldOptions(field: FieldDefinition): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const needsOptions = field.dataType === 'select' || field.dataType === 'multiselect';

  if (needsOptions && (field.options === undefined || field.options.length === 0)) {
    issues.push(
      issue(
        field.key,
        'missing_options',
        `Field ${field.key} of type ${field.dataType} must declare at least one option`,
      ),
    );
  }

  const seen = new Set<string>();
  for (const option of field.options ?? []) {
    if (seen.has(option.value)) {
      issues.push(
        issue(
          field.key,
          'duplicate_option',
          `Field ${field.key} declares option value ${JSON.stringify(option.value)} more than once`,
        ),
      );
    }
    seen.add(option.value);
  }

  return issues;
}

function validateFieldType(field: FieldDefinition): DefinitionValidationIssue[] {
  if (!isKnownDataType(field.dataType)) {
    return [
      issue(
        field.key,
        'unknown_data_type',
        `Field ${field.key} has unknown data type ${JSON.stringify(field.dataType)}; expected one of ${DATA_TYPES.join(', ')}`,
      ),
    ];
  }

  const issues = validateFieldOptions(field);

  if (field.dataType === 'reference') {
    const referenceType = field.referenceType;
    if (referenceType === undefined || referenceType.trim() === '') {
      issues.push(
        issue(
          field.key,
          'missing_reference_type',
          `Field ${field.key} of type reference must declare referenceType`,
        ),
      );
    }
  }

  return issues;
}

/**
 * Kiểm tra phụ thuộc giữa các field formula.
 *
 * Chỉ field `formula` là **nút** trong đồ thị; field thường là lá. Dùng DFS ba trạng thái
 * (unvisited → visiting → done) để bắt được cả chu trình dài, không chỉ `a ↔ b`.
 */
function validateFormulaFields(
  fields: readonly FieldDefinition[],
  declared: ReadonlySet<string>,
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [];
  const byKey = new Map(fields.map((field) => [field.key, field] as const));
  const formulaFields = fields.filter((field) => field.dataType === 'formula');
  const edges = new Map<string, string[]>();

  for (const field of formulaFields) {
    let dependencies: readonly string[];
    try {
      dependencies = parseFormula(field.formula ?? '').dependencies;
    } catch (error) {
      issues.push(
        issue(
          field.key,
          'formula_syntax',
          `Formula for ${field.key} is invalid: ${messageOf(error)}`,
        ),
      );
      edges.set(field.key, []);
      continue;
    }

    const formulaDependencies: string[] = [];
    for (const dependency of dependencies) {
      const target = byKey.get(dependency);

      if (target === undefined || !declared.has(dependency)) {
        issues.push(
          issue(
            field.key,
            'unknown_field',
            `Formula for ${field.key} references unknown field ${JSON.stringify(dependency)}`,
          ),
        );
        continue;
      }

      if (!canParticipateInFormula(target)) {
        issues.push(
          issue(
            field.key,
            'formula_unsupported_type',
            `Formula for ${field.key} references ${dependency} of type ${target.dataType}, which cannot be used in formulas`,
          ),
        );
        continue;
      }

      if (target.dataType === 'formula') {
        formulaDependencies.push(dependency);
      }
    }

    edges.set(field.key, formulaDependencies);
  }

  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (key: string, stack: string[]): void => {
    const current = state.get(key);
    if (current === 'done') return;
    if (current === 'visiting') {
      const cycle = [...stack.slice(stack.indexOf(key)), key];
      issues.push(
        issue(key, 'formula_cycle', `Formula cycle detected: ${cycle.join(' → ')}`),
      );
      return;
    }

    state.set(key, 'visiting');
    stack.push(key);
    for (const next of edges.get(key) ?? []) {
      visit(next, stack);
    }
    stack.pop();
    state.set(key, 'done');
  };

  for (const field of formulaFields) {
    visit(field.key, []);
  }

  return issues;
}

/**
 * Kiểm tra toàn bộ một type definition và trả về **mọi** issue tìm được.
 *
 * Trả mảng rỗng khi hợp lệ; không ném lỗi — Type Designer cần hiển thị nhiều lỗi cùng lúc.
 */
export interface TypeDefinitionValidationOptions {
  /**
   * Khoá hệ thống của **entity** đang được mở rộng (ví dụ `basePrice` của product).
   * Validator không tự biết entity là gì — nơi gọi truyền vào. Bỏ trống thì chỉ khoá
   * của envelope bị chặn (hành vi M1, không đổi).
   */
  readonly reservedKeys?: readonly string[];
}

export function validateTypeDefinition(
  def: TypeDefinition,
  options?: TypeDefinitionValidationOptions,
): DefinitionValidationIssue[] {
  const issues: DefinitionValidationIssue[] = [
    ...validateFieldKeys(def.fields, options?.reservedKeys ?? []),
  ];

  for (const field of def.fields) {
    issues.push(...validateFieldType(field));
  }

  const declared = new Set(def.fields.map((field) => field.key));

  for (const entry of def.listView) {
    if (!declared.has(entry)) {
      issues.push(
        issue(
          'listView',
          'unknown_list_field',
          `listView references ${JSON.stringify(entry)}, which is not a declared field`,
        ),
      );
    }
  }

  const indexedCount = def.fields.filter((field) => field.indexed === true).length;
  if (indexedCount > MAX_INDEXED_FIELDS) {
    issues.push(
      issue(
        'fields',
        'too_many_indexed',
        `Type ${def.key} declares ${indexedCount} indexed fields; at most ${MAX_INDEXED_FIELDS} are allowed`,
      ),
    );
  }

  issues.push(...validateFormulaFields(def.fields, declared));

  return issues;
}

/** Ném lỗi gộp mọi issue — dùng ở ranh giới tin cậy (lưu type, chạy migration). */
export function assertValidTypeDefinition(
  def: TypeDefinition,
  options?: TypeDefinitionValidationOptions,
): void {
  const issues = validateTypeDefinition(def, options);
  if (issues.length === 0) return;

  const details = issues.map((entry) => `  ${entry.code} at ${entry.path}: ${entry.message}`);
  throw new Error(
    `Invalid type definition ${JSON.stringify(def.key)}:\n${details.join('\n')}`,
  );
}
