import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import { createRecordRepository } from '../record-repository';
import { buildFormModel, buildListModel } from '../read-model';
import { migrateCollection } from '../migration';

describe('M1 acceptance — unlimited user-defined types (R1)', () => {
  it('adds a custom field to a built-in type and renders it', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);

    // 1. Admin thêm field "Độ cay" vào type Product có sẵn
    await registry.createType({
      key: 'product',
      kind: 'builtin_ext',
      baseType: 'product',
      name: { vi: 'Sản phẩm', en: 'Product' },
      branchId: 'hq',
    });
    await registry.updateType('product', {
      fields: [
        { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
        {
          key: 'spicy_level',
          label: { vi: 'Độ cay', en: 'Spicy level' },
          dataType: 'select',
          required: false,
          options: [
            { value: 'none', label: { vi: 'Không', en: 'None' } },
            { value: 'hot', label: { vi: 'Cay', en: 'Hot' } },
          ],
        },
      ],
      listView: ['name', 'spicy_level'],
    });

    // 2. Form tự sinh từ định nghĩa mới
    const definition = await registry.getType('product');
    const model = buildFormModel(definition!, { name: 'Phở bò', spicy_level: 'hot' });
    expect(model.fields.map((f) => f.field.key)).toEqual(['name', 'spicy_level']);
    expect(model.values.spicy_level).toBe('hot');
  });

  it('defines a brand-new entity type and runs generic CRUD on it', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);
    const repo = createRecordRepository(adapter);

    // 1. Định nghĩa type mới hoàn toàn: Supplier
    await registry.createType({
      key: 'supplier',
      kind: 'entity',
      baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' },
      branchId: 'hq',
    });
    await registry.updateType('supplier', {
      fields: [
        { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
        { key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false },
      ],
      listView: ['name', 'rating'],
    });

    // 2. CRUD không cần code riêng cho Supplier
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 4 } });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Vina', rating: 5 } });

    const all = await repo.list('supplier');
    expect(all.map((d) => d.name).sort()).toEqual(['Mekong', 'Vina']);

    // 3. List view tự sinh
    const definition = await registry.getType('supplier');
    const cells = buildListModel(definition!, all[0]!, 'vi');
    expect(cells.map((c) => c.key)).toEqual(['name', 'rating']);
  });

  it('migrates existing records after the admin edits a type', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);
    const repo = createRecordRepository(adapter);

    await registry.createType({
      key: 'supplier',
      kind: 'entity',
      baseType: null,
      name: { vi: 'Nhà cung cấp', en: 'Supplier' },
      branchId: 'hq',
    });
    await registry.updateType('supplier', {
      fields: [{ key: 'level', label: { vi: 'Mức', en: 'Level' }, dataType: 'text', required: false }],
    });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { level: 'mild' } });

    // Admin đổi tên field level -> rating, rồi map giá trị chữ sang số
    await registry.updateType('supplier', {
      fields: [
        { key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false },
      ],
      migration: [
        { kind: 'rename', from: 'level', to: 'rating' },
        { kind: 'mapValue', field: 'rating', map: { mild: 1, hot: 2 }, fallback: 0 },
      ],
    });

    const afterEdit = await registry.getType('supplier');

    // Chạy migration thật với đúng chuỗi bậc của type — không phải mảng rỗng,
    // nếu không transform không chạy và test sẽ xanh giả.
    const progress = await migrateCollection(adapter, afterEdit!, afterEdit!.migrations);

    // Đọc lại record và xác nhận đã chuyển đổi
    const migrated = await repo.get('supplier', 's001');
    expect(migrated!.rating).toBe(1);
    expect('level' in (migrated as unknown as Record<string, unknown>)).toBe(false);
    expect(progress.failed).toBe(0);
    expect(progress.migrated).toBe(1);
  });

  it('rejects a type definition that would break existing data', async () => {
    const adapter = await createMemoryAdapter();
    const registry = createTypeRegistry(adapter);

    await expect(
      registry
        .createType({
          key: 'supplier',
          kind: 'entity',
          baseType: null,
          name: { vi: 'NCC', en: 'Supplier' },
          branchId: 'hq',
        })
        .then(() =>
          registry.updateType('supplier', {
            fields: [
              {
                key: 'total',
                label: { vi: 'Tổng', en: 'Total' },
                dataType: 'formula',
                required: false,
                formula: 'missing_field * 2',
              },
            ],
          }),
        ),
    ).rejects.toThrow(/missing_field/);
  });
});
