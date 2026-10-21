import { describe, it, expect } from 'vitest';
import { i18n, SUPPORTED_LOCALES } from '../index';
import vi from '../vi.json';
import en from '../en.json';

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
