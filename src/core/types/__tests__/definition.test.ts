import { describe, it, expect } from 'vitest';
import { DATA_TYPES, SYSTEM_FIELD_KEYS, createTypeDefinitionDoc } from '../definition';

describe('DATA_TYPES', () => {
  it('covers exactly the data types promised in the spec', () => {
    expect([...DATA_TYPES].sort()).toEqual(
      [
        'boolean', 'color', 'date', 'datetime', 'decimal', 'formula',
        'image', 'money', 'multiselect', 'number', 'reference',
        'select', 'text', 'textarea',
      ].sort(),
    );
  });
});

describe('SYSTEM_FIELD_KEYS', () => {
  it('lists the envelope keys a custom field may not shadow', () => {
    expect([...SYSTEM_FIELD_KEYS]).toEqual(
      expect.arrayContaining([
        '_id', '_rev', 'docType', 'branchId', 'schemaVersion',
        'createdAt', 'updatedAt', 'deletedAt',
      ]),
    );
  });
});

describe('createTypeDefinitionDoc', () => {
  it('creates a type document carrying branchId and a version', () => {
    const doc = createTypeDefinitionDoc({
      key: 'product',
      kind: 'builtin_ext',
      baseType: 'product',
      name: { vi: 'Sản phẩm', en: 'Product' },
      branchId: 'hq',
    });

    expect(doc).toMatchObject({
      _id: 'type:product',
      docType: 'meta_type',
      branchId: 'hq',
      kind: 'builtin_ext',
      baseType: 'product',
      version: 1,
      fields: [],
      listView: [],
    });
    expect(doc.createdAt).toBeTruthy();
  });

  it('rejects an entity type that still carries a baseType', () => {
    expect(() =>
      createTypeDefinitionDoc({
        key: 'supplier',
        kind: 'entity',
        baseType: 'product',
        name: { vi: 'Nhà cung cấp', en: 'Supplier' },
        branchId: 'hq',
      }),
    ).toThrow(/baseType/i);
  });

  it('requires a baseType for a builtin_ext type', () => {
    expect(() =>
      createTypeDefinitionDoc({
        key: 'product',
        kind: 'builtin_ext',
        baseType: null,
        name: { vi: 'Sản phẩm', en: 'Product' },
        branchId: 'hq',
      }),
    ).toThrow(/baseType/i);
  });
});
