import { describe, it, expect } from 'vitest';
import { DATA_TYPES, type FieldDefinition } from '../definition';
import { FIELD_TYPES, fieldType, defaultValueFor, formatFieldValue } from '../field-registry';

function field(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'dataType'>): FieldDefinition {
  return { key: 'f', label: { vi: 'F', en: 'F' }, required: false, ...over };
}

/** [dataType, value, số issue mong đợi] — bảng này là hợp đồng của registry. */
const VALID_CASES: [FieldDefinition['dataType'], unknown, number][] = [
  ['text', 'Phở bò', 0],
  ['text', 42, 1],                    // sai kiểu
  ['textarea', 'nhiều\ndòng', 0],
  ['number', 42, 0],
  ['number', 42.5, 1],                // number là số nguyên
  ['decimal', 1234, 0],               // 12.34 với scale 2
  ['decimal', 12.34, 1],              // float bị từ chối
  ['money', { minor: 69000, currency: 'VND' }, 0],
  ['money', 69000, 1],                // phải là Money, không phải number
  ['boolean', true, 0],
  ['boolean', 'true', 1],
  ['date', '2026-10-20', 0],
  ['date', '20/10/2026', 1],          // phải là ISO
  ['datetime', '2026-10-20T10:00:00.000Z', 0],
  ['datetime', '2026-10-20', 1],
  ['select', 'mild', 0],
  ['select', 'khong-co-trong-options', 1],
  ['multiselect', ['mild', 'hot'], 0],
  ['multiselect', ['mild', 'khong-co-trong-options'], 1],
  ['multiselect', 'mild', 1],         // phải là mảng
  ['reference', 'product:p001', 0],
  ['reference', '', 1],
  ['image', 'data:image/png;base64,AAA', 0],
  ['image', 12345, 1],
  ['color', '#b45309', 0],
  ['color', 'do', 1],                 // phải là hex
  ['formula', null, 0],               // formula không nhận input trực tiếp
];

/** Field có options, dùng cho select/multiselect. */
const OPTION_FIELD = {
  options: [
    { value: 'mild', label: { vi: 'Nhẹ', en: 'Mild' } },
    { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
  ],
} satisfies Partial<FieldDefinition>;

/** Giá trị cho các case đặc thù, để bảng trên giữ đúng một dòng một case. */
function valueFor(dataType: FieldDefinition['dataType'], value: unknown): FieldDefinition {
  if (dataType === 'select' || dataType === 'multiselect') {
    return field({ dataType, ...OPTION_FIELD });
  }
  if (dataType === 'money') return field({ dataType });
  return field({ dataType });
}

describe('FIELD_TYPES registry', () => {
  it('has an entry for every declared data type', () => {
    expect(Object.keys(FIELD_TYPES).sort()).toEqual([...DATA_TYPES].sort());
  });

  it('fieldType() throws for an unknown data type', () => {
    expect(() => fieldType('nope' as never)).toThrow(/unknown data type/i);
  });

  it.each(VALID_CASES)('validates %s with value %o -> %i issue(s)', (dataType, value, expected) => {
    expect(fieldType(dataType).validate(value, valueFor(dataType, value))).toHaveLength(expected);
  });
});

describe('FIELD_TYPES contract', () => {
  it('marks formula support exactly for the numeric types', () => {
    const supported = [...DATA_TYPES].filter((t) => FIELD_TYPES[t].formulaSupport).sort();
    expect(supported).toEqual(['boolean', 'decimal', 'formula', 'money', 'number']);
  });

  it('names a default widget for every type, without importing Vue', () => {
    for (const dataType of DATA_TYPES) {
      expect(typeof FIELD_TYPES[dataType].defaultWidget).toBe('string');
      expect(FIELD_TYPES[dataType].defaultWidget.length).toBeGreaterThan(0);
      expect([...FIELD_TYPES[dataType].widgetOptions]).toContain(FIELD_TYPES[dataType].defaultWidget);
    }
  });

  it('never accepts a raw number as money', () => {
    const issues = fieldType('money').validate(69000, field({ dataType: 'money' }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('type');
  });

  it('rejects a money value whose minor is not a safe integer', () => {
    const issues = fieldType('money').validate(
      { minor: Number.MAX_SAFE_INTEGER + 2, currency: 'VND' },
      field({ dataType: 'money' }),
    );
    expect(issues).toHaveLength(1);
  });
});

describe('required and range', () => {
  it('reports a missing value for a required field', () => {
    const issues = fieldType('text').validate(null, field({ dataType: 'text', required: true }));
    expect(issues.map((i) => i.code)).toEqual(['required']);
  });

  it('accepts a missing value for an optional field', () => {
    expect(fieldType('number').validate(undefined, field({ dataType: 'number' }))).toEqual([]);
  });

  it('rejects a number below min or above max', () => {
    const bounded = field({ dataType: 'number', min: 1, max: 10 });
    expect(fieldType('number').validate(0, bounded)).toHaveLength(1);
    expect(fieldType('number').validate(11, bounded)).toHaveLength(1);
    expect(fieldType('number').validate(10, bounded)).toEqual([]);
  });
});

describe('date validity', () => {
  it('rejects an ISO-shaped but non-existent calendar date', () => {
    expect(fieldType('date').validate('2026-02-30', field({ dataType: 'date' }))).toHaveLength(1);
  });
});

describe('defaultValueFor', () => {
  it('returns the declared default when present', () => {
    expect(defaultValueFor(field({ dataType: 'text', defaultValue: 'abc' }))).toBe('abc');
  });

  it.each([
    ['text', ''],
    ['number', null],
    ['boolean', false],
    ['multiselect', []],
  ] as const)('falls back to an empty value for %s', (dataType, expected) => {
    expect(defaultValueFor(field({ dataType }))).toEqual(expected);
  });
});

describe('formatFieldValue', () => {
  it('formats money using the money formatter', () => {
    expect(formatFieldValue({ minor: 69000, currency: 'VND' }, field({ dataType: 'money' }), 'vi')).toContain('69');
  });

  it('formats decimal using its scale', () => {
    expect(formatFieldValue(1234, field({ dataType: 'decimal', scale: 2 }), 'vi')).toBe('12.34');
  });

  it('formats a boolean through i18n-neutral words', () => {
    expect(formatFieldValue(true, field({ dataType: 'boolean' }), 'vi')).toBe('true');
  });

  it('renders a dash for an empty value', () => {
    expect(formatFieldValue(null, field({ dataType: 'text' }), 'vi')).toBe('—');
  });

  it('renders the option label for a select value', () => {
    expect(
      formatFieldValue('hot', field({ dataType: 'select', ...OPTION_FIELD }), 'vi'),
    ).toBe('Cay');
  });

  it('renders option labels for a multiselect value', () => {
    expect(
      formatFieldValue(['mild', 'hot'], field({ dataType: 'multiselect', ...OPTION_FIELD }), 'en'),
    ).toBe('Mild, Hot');
  });
});
