import { describe, it, expect, beforeEach } from 'vitest';
import { money } from '../../money';
import { GLOBAL_BRANCH_ID } from '../../db/branch';
import type { DbAdapter } from '../../db/adapter';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { FieldDefinition, TypeDefinition } from '../../types/definition';
import { SYSTEM_FIELD_KEYS } from '../../types/definition';
import { assertNoUndeclaredKeys } from '../../types/custom-fields';
import type { CatalogRepository } from '../catalog-repository';
import { createCatalogRepository } from '../catalog-repository';
import { PRODUCT_SYSTEM_FIELDS } from '../product';
import {
  PRODUCT_BASE_TYPE,
  assertValidProductTypeDefinition,
  ensureProductTypeDefinition,
  productTypeReservedKeys,
  saveProductTypeDefinition,
} from '../product-type';

const NOW = '2026-10-22T09:00:00.000Z';

let adapter: DbAdapter;
let repo: CatalogRepository;

beforeEach(async () => {
  adapter = await createMemoryAdapter();
  repo = createCatalogRepository(adapter, () => NOW);
});

function textField(key: string): FieldDefinition {
  return { key, label: { vi: key, en: key }, dataType: 'text', required: false };
}

function numberField(key: string): FieldDefinition {
  return { key, label: { vi: key, en: key }, dataType: 'number', required: false };
}

function formulaField(key: string, formula: string): FieldDefinition {
  return { key, label: { vi: key, en: key }, dataType: 'formula', required: false, formula };
}

function productTypeDef(fields: readonly FieldDefinition[] = []): TypeDefinition {
  return {
    key: PRODUCT_BASE_TYPE,
    kind: 'builtin_ext',
    baseType: PRODUCT_BASE_TYPE,
    name: { vi: 'Sản phẩm', en: 'Product' },
    version: 1,
    fields: [...fields],
    listView: [],
  };
}

/** Một sản phẩm tối thiểu, không có field tuỳ chỉnh nào. */
async function createPho(extra: Record<string, unknown> = {}) {
  return repo.createProduct({
    id: 'pho-bo',
    name: { vi: 'Phở bò', en: 'Beef pho' },
    basePrice: money(65000, 'VND'),
    ...extra,
  });
}

describe('productTypeReservedKeys', () => {
  it('covers both the envelope keys and the product system fields', () => {
    const reserved = productTypeReservedKeys();

    for (const key of SYSTEM_FIELD_KEYS) expect(reserved).toContain(key);
    for (const key of PRODUCT_SYSTEM_FIELDS) expect(reserved).toContain(key);
  });
});

describe('assertValidProductTypeDefinition', () => {
  it('accepts a definition with ordinary custom fields', () => {
    expect(() =>
      assertValidProductTypeDefinition(productTypeDef([numberField('spicy_level')])),
    ).not.toThrow();
  });

  it('rejects a custom field shadowing a product system field', () => {
    expect(() =>
      assertValidProductTypeDefinition(productTypeDef([textField('basePrice')])),
    ).toThrow(/basePrice/);
  });

  it('rejects a custom field shadowing an envelope key', () => {
    expect(() => assertValidProductTypeDefinition(productTypeDef([textField('branchId')]))).toThrow(
      /branchId/,
    );
  });

  it('rejects a definition for a different base type', () => {
    expect(() =>
      assertValidProductTypeDefinition({ ...productTypeDef(), baseType: 'supplier' }),
    ).toThrow(/product/);
  });

  it('rejects an entity-kind definition', () => {
    expect(() =>
      assertValidProductTypeDefinition({
        ...productTypeDef(),
        kind: 'entity',
        baseType: null,
      }),
    ).toThrow(/product/);
  });
});

describe('ensureProductTypeDefinition', () => {
  it('creates the product type on demand, once', async () => {
    const first = await ensureProductTypeDefinition(adapter, { now: NOW });
    expect(first._id).toBe('type:product');
    expect(first.kind).toBe('builtin_ext');
    expect(first.baseType).toBe('product');
    expect(first.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(first.fields).toEqual([]);

    const again = await ensureProductTypeDefinition(adapter, { now: NOW });
    expect(again._rev).toBe(first._rev); // không tạo bản thứ hai
  });
});

describe('saveProductTypeDefinition', () => {
  it('creates the type when it does not exist yet, then adds fields', async () => {
    const saved = await saveProductTypeDefinition(adapter, {
      fields: [numberField('spicy_level')],
    });

    expect(saved.key).toBe(PRODUCT_BASE_TYPE);
    expect(saved.fields.map((field) => field.key)).toEqual(['spicy_level']);
    expect(saved.version).toBe(2);
  });

  it('refuses to save a definition that shadows a product system field', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });

    await expect(
      saveProductTypeDefinition(adapter, { fields: [textField('basePrice')] }),
    ).rejects.toThrow(/basePrice/);
  });
});

describe('assertNoUndeclaredKeys with the product binding', () => {
  it('rejects envelope keys and product system keys as system fields', async () => {
    const definition = await ensureProductTypeDefinition(adapter, { now: NOW });
    const binding = { definition, systemKeys: PRODUCT_SYSTEM_FIELDS };

    expect(() => assertNoUndeclaredKeys(binding, { branchId: 'hq' })).toThrow(/system field/i);
    expect(() => assertNoUndeclaredKeys(binding, { basePrice: money(1, 'VND') })).toThrow(
      /system field/i,
    );
  });

  it('rejects a key the type does not declare, and accepts a declared one', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });
    const definition = await ensureProductTypeDefinition(adapter, { now: NOW });
    const binding = { definition, systemKeys: PRODUCT_SYSTEM_FIELDS };

    expect(() => assertNoUndeclaredKeys(binding, { không_khai_báo: 1 })).toThrow(/không_khai_báo/);
    expect(() => assertNoUndeclaredKeys(binding, { spicy_level: 2 })).not.toThrow();
  });
});

describe('products with custom fields', () => {
  it('stores custom field values on the product and returns them on read', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });

    const product = await createPho({ spicy_level: 3 });

    expect(product.branchId).toBe(GLOBAL_BRANCH_ID);
    expect(product['spicy_level']).toBe(3);
    expect((await repo.getProduct('pho-bo'))?.['spicy_level']).toBe(3);
    expect((await repo.listProducts())[0]?.['spicy_level']).toBe(3);
  });

  it('refuses an undeclared key on a product', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });

    await expect(createPho({ không_khai_báo: 1 })).rejects.toThrow(/không_khai_báo/);
  });

  it('refuses a value of the wrong type for a custom field', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });

    await expect(createPho({ spicy_level: 'cay' })).rejects.toThrow(/spicy_level/);
  });

  it('refuses an undeclared key even when the product type was never created', async () => {
    // Chưa ai mở Type Designer: vẫn không được nhận khoá lạ, vì không có gì khai báo nó.
    await expect(createPho({ spicy_level: 3 })).rejects.toThrow(/spicy_level/);
  });

  it('updates a custom field and keeps the other one', async () => {
    await saveProductTypeDefinition(adapter, {
      fields: [numberField('spicy_level'), numberField('prep_minutes')],
    });
    const created = await createPho({ spicy_level: 3, prep_minutes: 5 });

    const updated = await repo.updateProduct(
      'pho-bo',
      { spicy_level: 4 },
      created._rev as string,
    );

    expect(updated['spicy_level']).toBe(4);
    expect(updated['prep_minutes']).toBe(5);
  });

  it('computes a formula custom field on read and never stores it', async () => {
    await saveProductTypeDefinition(adapter, {
      fields: [numberField('prep_minutes'), formulaField('prep_seconds', 'prep_minutes * 60')],
    });
    await createPho({ prep_minutes: 5 });

    const product = await repo.getProduct('pho-bo');
    expect(product?.['prep_seconds']).toBe(300);

    const stored = (await adapter.get('product:pho-bo')) as Record<string, unknown> | null;
    expect(Object.keys(stored ?? {})).not.toContain('prep_seconds');
  });

  it('lazily migrates a product when the product type changes', async () => {
    await saveProductTypeDefinition(adapter, { fields: [numberField('spicy_level')] });
    await createPho({ spicy_level: 3 });

    // Đổi tên field, kèm transform khai báo để dữ liệu cũ đi theo tên mới.
    await saveProductTypeDefinition(adapter, {
      fields: [numberField('spice')],
      migration: [{ kind: 'rename', from: 'spicy_level', to: 'spice' }],
    });

    const product = await repo.getProduct('pho-bo');
    expect(product?.['spice']).toBe(3);
    expect(product?.['spicy_level']).toBeUndefined();

    // Lazy migration ghi lại document — lần đọc sau không phải chạy lại.
    const stored = (await adapter.get('product:pho-bo')) as Record<string, unknown> | null;
    expect(stored?.['spice']).toBe(3);
    expect(stored?.['schemaVersion']).toBe(3);
  });
});
