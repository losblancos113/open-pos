import type { SupportedLocale } from '../../i18n';
import type { FieldDefinition, TypeDefinition } from './definition';
import { defaultValueFor, EMPTY_DISPLAY, fieldType, formatFieldValue } from './field-registry';
import type { ParsedFormula } from './formula';
import { parseFormula } from './formula';
import type { FormulaValue } from './formula-eval';
import { evaluateFormula, formulaValueOf } from './formula-eval';
import { ratToNumber } from './rational';

/** Một field đã sẵn sàng để render: giá trị suy ra, widget, và lỗi nếu có. */
export interface FormFieldModel {
  readonly field: FieldDefinition;
  readonly value: unknown;
  /** `true` với field `formula` — UI khoá ô nhập và hiện kết quả tính. */
  readonly computed: boolean;
  readonly widget: string;
  readonly error: string | null;
}

export interface FormModel {
  readonly typeKey: string;
  readonly version: number;
  readonly fields: readonly FormFieldModel[];
  /** Giá trị hiệu dụng của mọi field khai báo, kể cả field tính toán. */
  readonly values: Readonly<Record<string, unknown>>;
}

export interface ListCellModel {
  readonly key: string;
  readonly text: string;
}

interface FormulaComputation {
  /** Chỉ chứa field `formula`. Giá trị `null` nghĩa là không tính được. */
  readonly values: Readonly<Record<string, unknown>>;
  readonly errors: Readonly<Record<string, string>>;
}

function isFormulaField(field: FieldDefinition): boolean {
  return field.dataType === 'formula' && typeof field.formula === 'string';
}

function parseOrNull(source: string): ParsedFormula | null {
  try {
    return parseFormula(source);
  } catch {
    return null;
  }
}

/**
 * Thứ tự tính formula: phụ thuộc trước, phụ thuộc sau.
 *
 * Formula ở v1 là DAG — validation đã chặn chu trình. Ở đây vẫn phải cắt chu trình
 * để read model không treo nếu nhận một definition chưa qua validation.
 */
function orderFormulaFields(
  fields: readonly FieldDefinition[],
  byKey: ReadonlyMap<string, FieldDefinition>,
  parsed: ReadonlyMap<string, ParsedFormula>,
): readonly string[] {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (key: string): void => {
    if (state.has(key)) return;

    state.set(key, 'visiting');

    const formula = parsed.get(key);
    if (formula !== undefined) {
      for (const dependency of formula.dependencies) {
        if (byKey.get(dependency)?.dataType === 'formula') visit(dependency);
      }
    }

    state.set(key, 'done');
    order.push(key);
  };

  for (const field of fields) {
    if (isFormulaField(field)) visit(field.key);
  }

  return order;
}

/** Chuyển kết quả formula về giá trị thô để lưu trong record / render. */
function toRawValue(value: FormulaValue): unknown {
  switch (value.kind) {
    case 'money':
      return value.money;
    case 'boolean':
      return value.value;
    case 'number':
      return ratToNumber(value.value);
  }
}

/**
 * Tính mọi field `formula` trên một record.
 *
 * Không bao giờ ném lỗi: formula sai, thiếu giá trị, hay chia cho 0 đều cho `null`
 * kèm thông báo trong `errors`, để form vẫn render được.
 */
function computeFormulaValues(
  definition: TypeDefinition,
  record: Readonly<Record<string, unknown>>,
): FormulaComputation {
  const byKey = new Map<string, FieldDefinition>(definition.fields.map((f) => [f.key, f]));

  const parsed = new Map<string, ParsedFormula>();
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of definition.fields) {
    if (!isFormulaField(field)) continue;

    const result = parseOrNull(field.formula as string);
    if (result === null) {
      values[field.key] = null;
      errors[field.key] = `Formula of ${field.key} is not valid`;
      continue;
    }
    parsed.set(field.key, result);
  }

  // Giá trị chính xác của field formula đã tính — dùng cho chuỗi, không round-trip
  // qua giá trị thô (field `formula` không tham gia được vào formulaValueOf).
  const exact = new Map<string, FormulaValue>();

  for (const key of orderFormulaFields(definition.fields, byKey, parsed)) {
    const formula = parsed.get(key);
    // Formula không parse được đã được gán null + error ở lượt quét trước.
    if (formula === undefined) continue;

    const args: Record<string, FormulaValue> = {};
    let problem: string | null = null;

    for (const dependency of formula.dependencies) {
      const dependencyField = byKey.get(dependency);

      if (dependencyField === undefined) {
        problem = `Formula of ${key} references unknown field ${JSON.stringify(dependency)}`;
        break;
      }

      if (dependencyField.dataType === 'formula') {
        // Formula không được lưu vào record, nên chỉ dùng được giá trị vừa tính.
        const chained = exact.get(dependency);
        if (chained === undefined) {
          problem = `Cannot compute ${key}: ${JSON.stringify(dependency)} could not be computed`;
          break;
        }
        args[dependency] = chained;
        continue;
      }

      const raw = record[dependency];
      if (raw === undefined || raw === null) {
        problem = `Cannot compute ${key}: ${JSON.stringify(dependency)} is empty`;
        break;
      }

      const converted = formulaValueOf(dependencyField, raw);
      if (converted === null) {
        problem = `Cannot compute ${key}: ${JSON.stringify(dependency)} cannot be used in a formula`;
        break;
      }

      args[dependency] = converted;
    }

    if (problem !== null) {
      values[key] = null;
      errors[key] = problem;
      continue;
    }

    try {
      const result = evaluateFormula(formula, args);
      values[key] = toRawValue(result);
      exact.set(key, result);
    } catch (error) {
      values[key] = null;
      errors[key] = error instanceof Error ? error.message : String(error);
    }
  }

  return { values, errors };
}

/**
 * Giá trị của mọi field `formula`, tính theo thứ tự phụ thuộc.
 *
 * Field không phải formula không nằm trong kết quả — chúng đã có trong record.
 * Hàm thuần: `record` không bị sửa.
 */
export function computeFormulaFields(
  definition: TypeDefinition,
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return computeFormulaValues(definition, record).values;
}

function firstErrorMessage(field: FieldDefinition, value: unknown): string | null {
  const issues = fieldType(field.dataType).validate(value, field);
  const first = issues[0];
  return first === undefined ? null : first.message;
}

/** Giá trị hiệu dụng của một field: giá trị trong record, nếu không có thì lấy default. */
function effectiveValue(
  field: FieldDefinition,
  record: Readonly<Record<string, unknown>>,
): unknown {
  const raw = record[field.key];
  if (raw !== undefined && raw !== null) return raw;
  return defaultValueFor(field);
}

export function buildFormModel(
  definition: TypeDefinition,
  record: Readonly<Record<string, unknown>>,
): FormModel {
  const computed = computeFormulaValues(definition, record);

  const fields: FormFieldModel[] = [];
  const values: Record<string, unknown> = {};

  for (const field of definition.fields) {
    const isComputed = field.dataType === 'formula';
    const value = isComputed ? (computed.values[field.key] ?? null) : effectiveValue(field, record);

    values[field.key] = value;
    fields.push({
      field,
      value,
      computed: isComputed,
      widget: field.ui?.widget ?? fieldType(field.dataType).defaultWidget,
      // Field tính toán không nhập được, nên lỗi duy nhất có nghĩa là "không tính được".
      error: isComputed ? (computed.errors[field.key] ?? null) : firstErrorMessage(field, value),
    });
  }

  return { typeKey: definition.key, version: definition.version, fields, values };
}

/**
 * Một dòng của danh sách, theo đúng thứ tự cột trong `listView`.
 *
 * Type chưa cấu hình `listView` sẽ tự sinh cột từ toàn bộ field, để danh sách
 * dùng được ngay sau khi tạo type mà không cần thêm bước.
 */
export function buildListModel(
  definition: TypeDefinition,
  record: Readonly<Record<string, unknown>>,
  locale: SupportedLocale,
): readonly ListCellModel[] {
  const computed = computeFormulaValues(definition, record).values;
  const byKey = new Map<string, FieldDefinition>(definition.fields.map((f) => [f.key, f]));

  const columns =
    definition.listView.length > 0 ? definition.listView : definition.fields.map((f) => f.key);

  return columns.map((key) => {
    const field = byKey.get(key);

    if (field === undefined) {
      // Validation chặn listView trỏ tới field không khai báo; ở đây chỉ cần không vỡ UI.
      return { key, text: EMPTY_DISPLAY };
    }

    const value = field.dataType === 'formula' ? (computed[key] ?? null) : record[key];
    return { key, text: formatFieldValue(value, field, locale) };
  });
}
