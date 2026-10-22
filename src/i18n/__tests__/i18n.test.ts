// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { defineComponent } from 'vue';
import { mount } from '@vue/test-utils';
import { i18n, SUPPORTED_LOCALES, vuetifyAdapter, vuetifyLocale } from '../index';
import { useLocale } from '@vuetify/v0/locale';
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
  'type.designer.typeName',
  'type.designer.kind',
  'type.designer.baseType',
  'type.designer.fields',
  'type.designer.record',
  'type.designer.versionWarning',
  'type.kind.entity',
  'type.kind.builtinExt',
  'type.field.add',
  'type.field.remove',
  'type.field.key',
  'type.field.label',
  'type.field.dataType',
  'type.field.required',
  'type.field.options',
  'type.field.addOption',
  'type.field.removeOption',
  'type.field.formula',
  'type.field.scale',
  'type.field.referenceType',
  'type.field.indexed',
  'type.field.computed',
  'type.error.reservedKey',
  'type.error.duplicateKey',
  'type.error.unknownDataType',
  'type.error.missingOptions',
  'type.error.duplicateOption',
  'type.error.missingReferenceType',
  'type.error.tooManyIndexed',
  'type.error.unknownListField',
  'type.error.unknownField',
  'type.error.formulaCycle',
  'type.error.formulaUnsupportedType',
  'type.error.formulaSyntax',
  'type.migration.run',
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

describe('vuetify locale wiring', () => {
  it('resolves Vuetify0 internal keys instead of echoing them', () => {
    const adapter = vuetifyAdapter;
    // Nếu không ghép gói en của Vuetify0 vào messages, `t` trả về nguyên tên key
    // ("Input.required") và UI hiện chữ vô nghĩa.
    expect(adapter.t('Input.required')).toBe('Required');
    expect(adapter.t('Combobox.noResults')).toBe('No results');
    expect(adapter.t('AlertDialog.close')).toBe('Close');
  });

  it('returns undefined for an unknown key so components supply their own default', () => {
    const adapter = vuetifyAdapter;
    expect(adapter.ti('Input.doesNotExist')).toBeUndefined();
  });

  it('follows the active vue-i18n locale', () => {
    const adapter = vuetifyAdapter;
    const previous = i18n.global.locale.value;
    try {
      i18n.global.locale.value = 'en';
      expect(adapter.t('type.designer.title')).toBe('Type Designer');
      i18n.global.locale.value = 'vi';
      expect(adapter.t('type.designer.title')).toBe('Trình tạo type');
    } finally {
      i18n.global.locale.value = previous;
    }
  });

  it('routes component lookups through the vue-i18n adapter', () => {
    const Probe = defineComponent({
      setup() {
        const locale = useLocale();
        return { title: locale.t('type.designer.title') };
      },
      template: '<span>{{ title }}</span>',
    });

    const wrapper = mount(Probe, { global: { plugins: [i18n, vuetifyLocale] } });
    // Chỉ adapter vue-i18n mới biết key này.
    expect(wrapper.text()).toBe('Trình tạo type');
  });

  it('returns the raw key without the adapter, so the wiring is load-bearing', () => {
    const Probe = defineComponent({
      setup() {
        const locale = useLocale();
        return { title: locale.t('type.designer.title') };
      },
      template: '<span>{{ title }}</span>',
    });

    const wrapper = mount(Probe, { global: { plugins: [i18n] } });
    // Adapter mặc định của Vuetify0 chỉ có chuỗi của chính nó, nên trả về nguyên key.
    expect(wrapper.text()).toBe('type.designer.title');
  });
});
