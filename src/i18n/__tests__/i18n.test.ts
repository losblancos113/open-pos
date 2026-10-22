import { describe, it, expect } from 'vitest';
import { i18n, SUPPORTED_LOCALES } from '../index';
import vi from '../vi.json';
import en from '../en.json';
import { DATA_TYPES } from '@/core/types/definition';

function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (typeof acc !== 'object' || acc === null) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, obj);
}

const REQUIRED_TYPE_KEYS = [
  'type.designer.title',
  'type.designer.newType',
  'type.designer.editType',
  'type.designer.empty',
  'type.field.add',
  'type.field.remove',
  'type.field.key',
  'type.field.label',
  'type.field.dataType',
  'type.field.required',
  'type.field.options',
  'type.field.formula',
  'type.field.scale',
  'type.field.referenceType',
  'type.field.indexed',
  'type.field.computed',
  'type.error.reservedKey',
  'type.error.duplicateKey',
  'type.error.formulaCycle',
  'type.error.unknownField',
  'type.error.tooManyIndexed',
  'type.error.missingOptions',
  'type.error.unknownListField',
  'type.migration.running',
  'type.migration.done',
  'type.list.empty',
  'type.form.save',
  'type.form.cancel',
  'type.form.delete',
  'type.record.required',
];

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      return flatten(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('i18n', () => {
  it('supports vi and en', () => {
    expect(SUPPORTED_LOCALES).toEqual(['vi', 'en']);
  });

  it('defaults to Vietnamese', () => {
    expect(i18n.global.locale.value).toBe('vi');
  });

  it('has identical key sets in vi and en', () => {
    expect(flatten(en).sort()).toEqual(flatten(vi).sort());
  });

  it('has no empty translations', () => {
    for (const [locale, messages] of [
      ['vi', vi],
      ['en', en],
    ] as const) {
      const values = flatten(messages).map((path) =>
        path
          .split('.')
          .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], messages),
      );
      for (const value of values) {
        expect(typeof value, `empty translation in ${locale}`).toBe('string');
        expect((value as string).trim()).not.toBe('');
      }
    }
  });
});

describe('type designer i18n keys', () => {
  it.each(REQUIRED_TYPE_KEYS)('has %s in both locales', (key) => {
    expect(get(vi, key), `vi.json is missing ${key}`).toBeTruthy();
    expect(get(en, key), `en.json is missing ${key}`).toBeTruthy();
  });

  it('has a label for every data type', () => {
    for (const dataType of DATA_TYPES) {
      expect(
        get(vi, `type.dataType.${dataType}`),
        `vi.json is missing type.dataType.${dataType}`,
      ).toBeTruthy();
      expect(
        get(en, `type.dataType.${dataType}`),
        `en.json is missing type.dataType.${dataType}`,
      ).toBeTruthy();
    }
  });
});
