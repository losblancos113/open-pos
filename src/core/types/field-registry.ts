import type { SupportedLocale } from '../../i18n';
import { format as formatMoney } from '../money';
import type { Money } from '../money';
import type { DataType, FieldDefinition, FieldOption } from './definition';
import { DATA_TYPES } from './definition';

/** Mã lỗi chuẩn hoá để UI và test cùng phân loại được issue. */
export type ValidationCode =
  | 'required'
  | 'type'
  | 'range'
  | 'length'
  | 'option'
  | 'scale'
  | 'reference';

export interface ValidationIssue {
  readonly path: string;
  readonly code: ValidationCode;
  readonly message: string;
}

/**
 * Hợp đồng của một data type: cách validate giá trị người dùng nhập, cách format
 * để hiển thị, và widget mặc định ở UI.
 *
 * `defaultWidget` / `widgetOptions` là **tên** widget (chuỗi), không phải component —
 * file này không được import Vue (AGENTS.md §2).
 */
export interface FieldTypeDefinition {
  readonly dataType: DataType;
  readonly validate: (value: unknown, field: FieldDefinition) => ValidationIssue[];
  readonly format: (value: unknown, field: FieldDefinition, locale: SupportedLocale) => string;
  readonly defaultWidget: string;
  readonly widgetOptions: readonly string[];
  readonly formulaSupport: boolean;
}

const EMPTY_DISPLAY = '—';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;
const DATA_URL = /^data:[^;,]+;base64,/;

const CURRENCIES = ['VND', 'USD'] as const;

function issue(path: string, code: ValidationCode, message: string): ValidationIssue {
  return { path, code, message };
}

function isMoney(value: unknown): value is Money {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { minor?: unknown; currency?: unknown };
  return (
    typeof candidate.minor === 'number' &&
    Number.isSafeInteger(candidate.minor) &&
    typeof candidate.currency === 'string' &&
    (CURRENCIES as readonly string[]).includes(candidate.currency)
  );
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined;
}

/** Ngày ISO hợp lệ **và** tồn tại thật (loại 2026-02-30). */
function isValidIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function decimalScale(field: FieldDefinition): number {
  return field.scale ?? 2;
}

function pow10(exponent: number): number {
  return 10 ** exponent;
}

/**
 * Validate chung: giá trị vắng mặt chỉ hợp lệ khi field không bắt buộc.
 * Trả về `null` nghĩa là "đi tiếp kiểm tra kiểu".
 */
function absentIssue(value: unknown, field: FieldDefinition): ValidationIssue[] | null {
  if (isAbsent(value)) {
    return field.required
      ? [issue(field.key, 'required', `${field.key} is required`)]
      : [];
  }
  return null;
}

function typeIssue(field: FieldDefinition, expected: string, value: unknown): ValidationIssue {
  return issue(field.key, 'type', `${field.key} must be ${expected}, got ${describe(value)}`);
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  if (typeof value === 'object') return 'object';
  return String(value);
}

/** Với field không phải required, chuỗi rỗng vẫn là giá trị không hợp lệ. */
function isBlankString(value: unknown): boolean {
  return typeof value === 'string' && value.trim() === '';
}

function optionValues(field: FieldDefinition): readonly FieldOption[] {
  return field.options ?? [];
}

function findOption(field: FieldDefinition, value: string): FieldOption | undefined {
  return optionValues(field).find((option) => option.value === value);
}

function labelFor(option: FieldOption, locale: SupportedLocale): string {
  return option.label[locale] ?? option.label.vi;
}

/** Format số nguyên đã scale thành chuỗi thập phân cố định (ví dụ 1234, scale 2 → `12.34`). */
function formatScaledInteger(value: number, scale: number): string {
  const negative = value < 0;
  const absolute = Math.abs(value);
  const unit = pow10(scale);
  const whole = Math.trunc(absolute / unit);
  const fraction = absolute % unit;
  const sign = negative ? '-' : '';
  if (scale === 0) return `${sign}${whole}`;
  return `${sign}${whole}.${fraction.toString().padStart(scale, '0')}`;
}

function formatBoolean(value: boolean): string {
  return value ? 'true' : 'false';
}

/** Format dùng chung cho các field sinh giá trị số học (number, decimal, formula…). */
function formatNumericLike(value: unknown): string | null {
  if (typeof value === 'boolean') return formatBoolean(value);
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  if (isMoney(value)) return null; // xử lý riêng, cần locale
  return null;
}

function numberRangeIssues(value: number, field: FieldDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (field.min !== undefined && value < field.min) {
    issues.push(issue(field.key, 'range', `${field.key} must be at least ${field.min}, got ${value}`));
  }
  if (field.max !== undefined && value > field.max) {
    issues.push(issue(field.key, 'range', `${field.key} must be at most ${field.max}, got ${value}`));
  }
  return issues;
}

const registry: Record<DataType, FieldTypeDefinition> = {
  text: {
    dataType: 'text',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string') return [typeIssue(field, 'a string', value)];
      return [];
    },
    format: (value) => (isAbsent(value) ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'text',
    widgetOptions: ['text'],
    formulaSupport: false,
  },

  textarea: {
    dataType: 'textarea',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string') return [typeIssue(field, 'a string', value)];
      return [];
    },
    format: (value) => (isAbsent(value) ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'textarea',
    widgetOptions: ['textarea'],
    formulaSupport: false,
  },

  number: {
    dataType: 'number',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (!Number.isInteger(value)) return [typeIssue(field, 'an integer', value)];
      return numberRangeIssues(value as number, field);
    },
    format: (value) => {
      const formatted = formatNumericLike(value);
      return formatted ?? EMPTY_DISPLAY;
    },
    defaultWidget: 'number',
    widgetOptions: ['number', 'stepper'],
    formulaSupport: true,
  },

  decimal: {
    dataType: 'decimal',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      const scale = field.scale;
      if (scale !== undefined && (!Number.isInteger(scale) || scale < 0)) {
        return [issue(field.key, 'scale', `${field.key} scale must be a non-negative integer, got ${scale}`)];
      }
      if (!Number.isInteger(value)) return [typeIssue(field, 'a scaled integer', value)];
      return numberRangeIssues((value as number) / pow10(decimalScale(field)), field);
    },
    format: (value, field) =>
      isAbsent(value)
        ? EMPTY_DISPLAY
        : Number.isInteger(value)
          ? formatScaledInteger(value as number, decimalScale(field))
          : EMPTY_DISPLAY,
    defaultWidget: 'number',
    widgetOptions: ['number'],
    formulaSupport: true,
  },

  money: {
    dataType: 'money',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (!isMoney(value)) return [typeIssue(field, 'a Money object', value)];
      return numberRangeIssues((value as Money).minor, field);
    },
    format: (value, _field, locale) =>
      isMoney(value) ? formatMoney(value, locale === 'vi' ? 'vi-VN' : 'en-US') : EMPTY_DISPLAY,
    defaultWidget: 'money',
    widgetOptions: ['money'],
    formulaSupport: true,
  },

  boolean: {
    dataType: 'boolean',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'boolean') return [typeIssue(field, 'a boolean', value)];
      return [];
    },
    format: (value) => (typeof value === 'boolean' ? formatBoolean(value) : EMPTY_DISPLAY),
    defaultWidget: 'checkbox',
    widgetOptions: ['checkbox', 'switch', 'toggle'],
    formulaSupport: true,
  },

  date: {
    dataType: 'date',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string' || !isValidIsoDate(value)) {
        return [typeIssue(field, 'an ISO date (YYYY-MM-DD)', value)];
      }
      return [];
    },
    format: (value) => (isAbsent(value) ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'date',
    widgetOptions: ['date'],
    formulaSupport: false,
  },

  datetime: {
    dataType: 'datetime',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string' || !ISO_DATETIME.test(value)) {
        return [typeIssue(field, 'an ISO datetime', value)];
      }
      const datePart = value.slice(0, 10);
      if (!isValidIsoDate(datePart)) return [typeIssue(field, 'an ISO datetime', value)];
      return [];
    },
    format: (value) => (isAbsent(value) ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'datetime',
    widgetOptions: ['datetime'],
    formulaSupport: false,
  },

  select: {
    dataType: 'select',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string') return [typeIssue(field, 'a string option value', value)];
      if (!findOption(field, value)) {
        return [
          issue(field.key, 'option', `${field.key} value ${describe(value)} is not one of the declared options`),
        ];
      }
      return [];
    },
    format: (value, field, locale) => {
      if (isAbsent(value) || typeof value !== 'string') return EMPTY_DISPLAY;
      const option = findOption(field, value);
      return option ? labelFor(option, locale) : value;
    },
    defaultWidget: 'select',
    widgetOptions: ['select', 'radio'],
    formulaSupport: false,
  },

  multiselect: {
    dataType: 'multiselect',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (!Array.isArray(value)) return [typeIssue(field, 'an array of option values', value)];
      const issues: ValidationIssue[] = [];
      for (const entry of value) {
        if (typeof entry !== 'string' || !findOption(field, entry)) {
          issues.push(
            issue(field.key, 'option', `${field.key} value ${describe(entry)} is not one of the declared options`),
          );
        }
      }
      return issues;
    },
    format: (value, field, locale) => {
      if (!Array.isArray(value) || value.length === 0) return EMPTY_DISPLAY;
      return value
        .map((entry) => {
          if (typeof entry !== 'string') return String(entry);
          const option = findOption(field, entry);
          return option ? labelFor(option, locale) : entry;
        })
        .join(', ');
    },
    defaultWidget: 'checkbox-group',
    widgetOptions: ['checkbox-group', 'multiselect'],
    formulaSupport: false,
  },

  reference: {
    dataType: 'reference',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string') return [typeIssue(field, 'a document id string', value)];
      if (isBlankString(value)) {
        return [issue(field.key, 'reference', `${field.key} must reference a document, got an empty id`)];
      }
      return [];
    },
    format: (value) => (isAbsent(value) || value === '' ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'combobox',
    widgetOptions: ['combobox', 'select'],
    formulaSupport: false,
  },

  image: {
    dataType: 'image',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string') return [typeIssue(field, 'a data URL or image id', value)];
      if (isBlankString(value)) return [typeIssue(field, 'a data URL or image id', value)];
      return [];
    },
    format: (value) => (isAbsent(value) || value === '' ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'image',
    widgetOptions: ['image', 'text'],
    formulaSupport: false,
  },

  color: {
    dataType: 'color',
    validate(value, field) {
      const absent = absentIssue(value, field);
      if (absent) return absent;
      if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
        return [typeIssue(field, 'a hex colour (#RRGGBB)', value)];
      }
      return [];
    },
    format: (value) => (isAbsent(value) || value === '' ? EMPTY_DISPLAY : String(value)),
    defaultWidget: 'color',
    widgetOptions: ['color'],
    formulaSupport: false,
  },

  formula: {
    dataType: 'formula',
    validate: () => [],
    format: (value) => {
      if (typeof value === 'boolean') return formatBoolean(value);
      if (typeof value === 'number') return String(value);
      if (isMoney(value)) return formatMoney(value, 'vi-VN');
      return EMPTY_DISPLAY;
    },
    defaultWidget: 'computed',
    widgetOptions: ['computed'],
    formulaSupport: true,
  },
};

export const FIELD_TYPES: Record<DataType, FieldTypeDefinition> = registry;

/** Entry của registry; ném lỗi rõ ràng cho type lạ để lỗi lập trình không lọt vào UI. */
export function fieldType(dataType: DataType): FieldTypeDefinition {
  const definition: FieldTypeDefinition | undefined = FIELD_TYPES[dataType];
  if (!definition) {
    throw new Error(
      `fieldType(): unknown data type ${describe(dataType)}; expected one of ${DATA_TYPES.join(', ')}`,
    );
  }
  return definition;
}

const EMPTY_DEFAULTS: Partial<Record<DataType, unknown>> = {
  text: '',
  textarea: '',
  number: null,
  decimal: null,
  money: null,
  boolean: false,
  date: null,
  datetime: null,
  select: null,
  multiselect: [],
  reference: null,
  image: null,
  color: null,
  formula: null,
};

/** Giá trị khởi tạo cho form: ưu tiên `defaultValue` khai báo trên field. */
export function defaultValueFor(field: FieldDefinition): unknown {
  if (field.defaultValue !== undefined) return field.defaultValue;
  return EMPTY_DEFAULTS[field.dataType] ?? null;
}

/** Chuỗi hiển thị cho một giá trị field. Giá trị rỗng luôn là `—`. */
export function formatFieldValue(
  value: unknown,
  field: FieldDefinition,
  locale: SupportedLocale,
): string {
  if (isAbsent(value)) return EMPTY_DISPLAY;
  if (field.dataType === 'formula' && field.formula === undefined) return EMPTY_DISPLAY;
  if (field.dataType === 'money' && !isMoney(value)) return EMPTY_DISPLAY;
  return fieldType(field.dataType).format(value, field, locale);
}
