import { describe, it, expect } from 'vitest';
import type { FieldDefinition, TypeDefinition } from '../definition';
import {
  MAX_INDEXED_FIELDS,
  assertValidTypeDefinition,
  validateTypeDefinition,
} from '../definition-validation';

function f(over: Partial<FieldDefinition> & Pick<FieldDefinition, 'key' | 'dataType'>): FieldDefinition {
  return { label: { vi: over.key, en: over.key }, required: false, ...over };
}

function typeOf(fields: FieldDefinition[], listView: string[] = []): TypeDefinition {
  return {
    key: 'product',
    kind: 'builtin_ext',
    baseType: 'product',
    name: { vi: 'SP', en: 'Product' },
    version: 1,
    fields,
    listView,
  };
}

function codes(def: TypeDefinition): string[] {
  return validateTypeDefinition(def)
    .map((issue) => issue.code)
    .sort();
}

describe('validateTypeDefinition', () => {
  it('accepts a well-formed definition', () => {
    expect(
      validateTypeDefinition(
        typeOf(
          [
            f({
              key: 'spicy_level',
              dataType: 'select',
              options: [{ value: 'none', label: { vi: 'Không', en: 'None' } }],
            }),
          ],
          ['spicy_level'],
        ),
      ),
    ).toEqual([]);
  });

  it('rejects a field key starting with an underscore', () => {
    expect(codes(typeOf([f({ key: '_secret', dataType: 'text' })]))).toContain('reserved_key');
  });

  it('rejects a field key that shadows a system field', () => {
    expect(codes(typeOf([f({ key: 'branchId', dataType: 'text' })]))).toContain('reserved_key');
    expect(codes(typeOf([f({ key: 'schemaVersion', dataType: 'number' })]))).toContain(
      'reserved_key',
    );
  });

  it('rejects a custom field that shadows an entity system field', () => {
    const def = typeOf([f({ key: 'basePrice', dataType: 'money' })]);

    // Không truyền `reservedKeys` thì chỉ khoá của envelope bị chặn — validator không
    // biết entity nào đang được mở rộng, nên `basePrice` vẫn qua được.
    expect(codes(def)).not.toContain('reserved_key');

    const issues = validateTypeDefinition(def, { reservedKeys: ['basePrice'] });
    expect(issues[0]?.code).toBe('reserved_key');
    expect(issues[0]?.message).toContain('basePrice');
  });

  it('rejects duplicate field keys', () => {
    expect(
      codes(typeOf([f({ key: 'dup', dataType: 'text' }), f({ key: 'dup', dataType: 'number' })])),
    ).toContain('duplicate_key');
  });

  it('rejects a select field with no options', () => {
    expect(codes(typeOf([f({ key: 'sel', dataType: 'select' })]))).toContain('missing_options');
  });

  it('rejects duplicate option values', () => {
    expect(
      codes(
        typeOf([
          f({
            key: 'sel',
            dataType: 'select',
            options: [
              { value: 'a', label: { vi: 'A', en: 'A' } },
              { value: 'a', label: { vi: 'B', en: 'B' } },
            ],
          }),
        ]),
      ),
    ).toContain('duplicate_option');
  });

  it('rejects a formula field that references an unknown field', () => {
    expect(
      codes(typeOf([f({ key: 'cost', dataType: 'formula', formula: 'price * 0.6' })])),
    ).toContain('unknown_field');
  });

  it('accepts a formula field whose dependencies all exist', () => {
    expect(
      validateTypeDefinition(
        typeOf([
          f({ key: 'price', dataType: 'money' }),
          f({ key: 'cost', dataType: 'formula', formula: 'price * 0.6' }),
        ]),
      ),
    ).toEqual([]);
  });

  it('detects a formula cycle', () => {
    expect(
      codes(
        typeOf([
          f({ key: 'a', dataType: 'formula', formula: 'b + 1' }),
          f({ key: 'b', dataType: 'formula', formula: 'a + 1' }),
        ]),
      ),
    ).toContain('formula_cycle');
  });

  it('detects a longer formula cycle', () => {
    expect(
      codes(
        typeOf([
          f({ key: 'a', dataType: 'formula', formula: 'b + 1' }),
          f({ key: 'b', dataType: 'formula', formula: 'c + 1' }),
          f({ key: 'c', dataType: 'formula', formula: 'a + 1' }),
        ]),
      ),
    ).toContain('formula_cycle');
  });

  it('rejects a formula referencing a field that cannot be used in formulas', () => {
    expect(
      codes(
        typeOf([
          f({ key: 'note', dataType: 'textarea' }),
          f({ key: 'cost', dataType: 'formula', formula: 'note + 1' }),
        ]),
      ),
    ).toContain('formula_unsupported_type');
  });

  it('rejects more than MAX_INDEXED_FIELDS indexed fields', () => {
    const fields = Array.from({ length: MAX_INDEXED_FIELDS + 1 }, (_, i) =>
      f({ key: `k${i}`, dataType: 'text', indexed: true }),
    );
    expect(codes(typeOf(fields))).toContain('too_many_indexed');
  });

  it('rejects a listView entry that is not a declared field', () => {
    expect(codes(typeOf([f({ key: 'name', dataType: 'text' })], ['name', 'ghost']))).toContain(
      'unknown_list_field',
    );
  });

  it('rejects a reference field with no referenceType', () => {
    expect(codes(typeOf([f({ key: 'ref', dataType: 'reference' })]))).toContain(
      'missing_reference_type',
    );
  });

  it('rejects a formula that does not parse', () => {
    expect(
      codes(typeOf([f({ key: 'cost', dataType: 'formula', formula: 'price *' })])),
    ).toContain('formula_syntax');
  });

  it('rejects a formula field with no expression', () => {
    expect(codes(typeOf([f({ key: 'cost', dataType: 'formula' })]))).toContain('formula_syntax');
  });

  it('reports the field key in the issue path', () => {
    const issues = validateTypeDefinition(typeOf([f({ key: '_bad', dataType: 'text' })]));
    expect(issues.map((issue) => issue.path)).toContain('_bad');
  });

  it('assertValidTypeDefinition throws with every issue in the message', () => {
    expect(() => assertValidTypeDefinition(typeOf([f({ key: '_bad', dataType: 'select' })]))).toThrow(
      /_bad/,
    );
  });

  it('assertValidTypeDefinition stays silent for a valid definition', () => {
    expect(() =>
      assertValidTypeDefinition(typeOf([f({ key: 'name', dataType: 'text' })], ['name'])),
    ).not.toThrow();
  });
});
