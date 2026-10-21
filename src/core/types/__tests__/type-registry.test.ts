import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import type { FieldDefinition, TypeDefinitionDoc } from '../definition';

const spicyField: FieldDefinition = {
  key: 'spicy_level',
  label: { vi: 'Độ cay', en: 'Spicy level' },
  dataType: 'select',
  required: false,
  options: [
    { value: 'none', label: { vi: 'Không', en: 'None' } },
    { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
  ],
};

const validInput = {
  key: 'product',
  kind: 'builtin_ext' as const,
  baseType: 'product',
  name: { vi: 'Sản phẩm', en: 'Product' },
  branchId: 'hq',
};

async function registry() {
  const adapter = await createMemoryAdapter();
  return { adapter, registry: createTypeRegistry(adapter) };
}

describe('createType', () => {
  it('persists a new type definition', async () => {
    const { adapter, registry: r } = await registry();
    const doc = await r.createType({ ...validInput, fields: [spicyField] });

    expect(doc._id).toBe('type:product');
    expect(doc.version).toBe(1);
    const stored = (await adapter.get('type:product')) as TypeDefinitionDoc | null;
    expect(stored!.key).toBe('product');
  });

  it('rejects an invalid definition and does not write', async () => {
    const { adapter, registry: r } = await registry();
    await expect(
      r.createType({ ...validInput, fields: [{ ...spicyField, key: '_bad' }] }),
    ).rejects.toThrow(/_bad/);
    expect(await adapter.get('type:product')).toBeNull();
  });

  it('rejects a duplicate type key', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await expect(r.createType({ ...validInput, fields: [spicyField] })).rejects.toThrow(
      /already exists/i,
    );
  });

  it('creates an entity type with baseType null', async () => {
    const { registry: r } = await registry();
    const doc = await r.createType({
      key: 'supplier',
      kind: 'entity',
      baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' },
      branchId: 'hq',
    });
    expect(doc).toMatchObject({ key: 'supplier', kind: 'entity', baseType: null });
  });

  it('refuses to re-create a key whose document was soft-deleted', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.deleteType('product');

    // Tái sử dụng key sau soft-delete sẽ làm version tụt về 1 trong khi record cũ
    // vẫn ở version cao hơn → chuỗi migration khuyết bậc. Từ chối thẳng là chủ ý.
    await expect(r.createType({ ...validInput, fields: [spicyField] })).rejects.toThrow(
      /already exists/i,
    );
  });

  it('starts a type with an empty migration history', async () => {
    const { registry: r } = await registry();
    const doc = await r.createType({ ...validInput, fields: [spicyField] });
    expect(doc.migrations).toEqual([]);
  });

  it('uses the injected clock for envelope timestamps', async () => {
    const adapter = await createMemoryAdapter();
    const r = createTypeRegistry(adapter, () => '2020-01-01T00:00:00.000Z');

    const doc = await r.createType({ ...validInput, fields: [spicyField] });

    expect(doc.createdAt).toBe('2020-01-01T00:00:00.000Z');
    expect(doc.updatedAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('getType / listTypes', () => {
  it('returns null for an unknown key', async () => {
    const { registry: r } = await registry();
    expect(await r.getType('ghost')).toBeNull();
  });

  it('lists types and can filter by kind', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.createType({
      key: 'supplier',
      kind: 'entity',
      baseType: null,
      name: { vi: 'NCC', en: 'Supplier' },
      branchId: 'hq',
    });

    expect((await r.listTypes()).map((t) => t.key).sort()).toEqual(['product', 'supplier']);
    expect((await r.listTypes({ kind: 'entity' })).map((t) => t.key)).toEqual(['supplier']);
  });
});

describe('updateType', () => {
  it('bumps the version when fields change', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    const updated = await r.updateType('product', {
      fields: [
        spicyField,
        { key: 'note', label: { vi: 'Ghi chú', en: 'Note' }, dataType: 'text', required: false },
      ],
    });
    expect(updated.version).toBe(2);
  });

  it('keeps the version when only the label changes', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    const updated = await r.updateType('product', { name: { vi: 'Món ăn', en: 'Dish' } });
    expect(updated.version).toBe(1);
  });

  it('validates the resulting definition before writing', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await expect(
      r.updateType('product', { fields: [{ ...spicyField, key: 'branchId' }] }),
    ).rejects.toThrow(/branchId/);
  });

  it('rejects an unknown type key', async () => {
    const { registry: r } = await registry();
    await expect(r.updateType('ghost', { name: { vi: 'X', en: 'X' } })).rejects.toThrow(
      /not found/i,
    );
  });

  it('surfaces a concurrent modification instead of overwriting it', async () => {
    const { registry: r } = await registry();
    const created = await r.createType({ ...validInput, fields: [spicyField] });

    // Một terminal khác ghi trước, làm _rev thay đổi.
    await r.updateType('product', { name: { vi: 'A', en: 'A' } });

    // Bản sao cũ (thiếu _rev mới) phải bị từ chối, không im lặng ghi đè.
    await expect(
      r.updateType('product', { name: { vi: 'B', en: 'B' } }, { expectedRev: created._rev as string }),
    ).rejects.toThrow(/conflict/i);
  });

  it('records a declared migration step when the version bumps', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });

    const updated = await r.updateType('product', {
      fields: [
        { key: 'spicy_rating', label: { vi: 'Điểm cay', en: 'Spicy rating' }, dataType: 'number', required: false },
      ],
      migration: [{ kind: 'rename', from: 'spicy_level', to: 'spicy_rating' }],
    });

    expect(updated.version).toBe(2);
    expect(updated.migrations).toEqual([
      {
        fromVersion: 1,
        toVersion: 2,
        transforms: [{ kind: 'rename', from: 'spicy_level', to: 'spicy_rating' }],
      },
    ]);
  });

  it('records a step with no transforms when the version bumps without a migration', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    const updated = await r.updateType('product', {
      fields: [
        { key: 'note', label: { vi: 'Ghi chú', en: 'Note' }, dataType: 'text', required: false },
      ],
    });

    // Bậc 1->2 phải tồn tại (dù rỗng) để chuỗi migration không bị khuyết.
    expect(updated.migrations).toEqual([{ fromVersion: 1, toVersion: 2, transforms: [] }]);
  });

  it('appends to the migration history across successive bumps', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.updateType('product', { name: { vi: 'A', en: 'A' } });
    await r.updateType('product', {
      fields: [
        { key: 'note', label: { vi: 'Ghi chú', en: 'Note' }, dataType: 'text', required: false },
      ],
    });
    const third = await r.updateType('product', {
      fields: [
        { key: 'comment', label: { vi: 'Bình luận', en: 'Comment' }, dataType: 'text', required: false },
      ],
      migration: [{ kind: 'rename', from: 'note', to: 'comment' }],
    });

    expect(third.version).toBe(3);
    expect(third.migrations).toEqual([
      { fromVersion: 1, toVersion: 2, transforms: [] },
      {
        fromVersion: 2,
        toVersion: 3,
        transforms: [{ kind: 'rename', from: 'note', to: 'comment' }],
      },
    ]);
  });
});

describe('deleteType', () => {
  it('soft-deletes a type definition', async () => {
    const { registry: r } = await registry();
    await r.createType({ ...validInput, fields: [spicyField] });
    await r.deleteType('product');

    expect(await r.getType('product')).toBeNull();
    expect(await r.listTypes()).toEqual([]);
  });

  it('is a no-op for an unknown key', async () => {
    const { registry: r } = await registry();
    await expect(r.deleteType('ghost')).resolves.toBeUndefined();
  });
});
