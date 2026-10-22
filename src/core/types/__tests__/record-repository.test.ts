import { describe, it, expect } from 'vitest';
import { createMemoryAdapter } from '../../db/memory-adapter';
import { createTypeRegistry } from '../type-registry';
import { createRecordRepository } from '../record-repository';
import type { FieldDefinition } from '../definition';

const supplierFields: FieldDefinition[] = [
  { key: 'name', label: { vi: 'Tên', en: 'Name' }, dataType: 'text', required: true },
  { key: 'rating', label: { vi: 'Đánh giá', en: 'Rating' }, dataType: 'number', required: false },
];

async function setup() {
  const adapter = await createMemoryAdapter();
  const registry = createTypeRegistry(adapter);
  await registry.createType({
    key: 'supplier',
    kind: 'entity',
    baseType: null,
    name: { vi: 'Nhà cung cấp', en: 'Supplier' },
    branchId: 'hq',
  });
  await registry.updateType('supplier', { fields: supplierFields });
  return { adapter, registry, repo: createRecordRepository(adapter) };
}

describe('create', () => {
  it('creates a record for a brand-new entity type', async () => {
    const { adapter, repo } = await setup();
    const doc = await repo.create({
      typeKey: 'supplier',
      branchId: 'hq',
      data: { name: 'Mekong', rating: 4 },
    });

    expect(doc._id).toBe('supplier:s001');
    expect(doc.docType).toBe('supplier');
    expect(doc.branchId).toBe('hq');
    expect(doc.name).toBe('Mekong');
    expect((await adapter.get('supplier:s001'))!.docType).toBe('supplier');
  });

  it('rejects missing data for a required field', async () => {
    const { repo } = await setup();
    await expect(
      repo.create({ typeKey: 'supplier', branchId: 'hq', data: { rating: 4 } }),
    ).rejects.toThrow(/name/i);
  });

  it('rejects a wrong data type', async () => {
    const { repo } = await setup();
    await expect(
      repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', rating: 'cao' } }),
    ).rejects.toThrow(/rating/i);
  });

  it('rejects an unknown type key', async () => {
    const { repo } = await setup();
    await expect(repo.create({ typeKey: 'ghost', branchId: 'hq', data: {} })).rejects.toThrow(
      /not found/i,
    );
  });

  it('rejects a field that the type does not declare', async () => {
    const { repo } = await setup();
    await expect(
      repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong', ghost: 1 } }),
    ).rejects.toThrow(/ghost/i);
  });
});

describe('update / get / list / remove', () => {
  it('round-trips a record', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    const updated = await repo.update({
      typeKey: 'supplier',
      id: 's001',
      data: { name: 'Mekong 2' },
      expectedRev: created._rev as string,
    });

    expect(updated.name).toBe('Mekong 2');
    expect((await repo.get('supplier', 's001'))!.name).toBe('Mekong 2');
  });

  it('lists only records of the given type', async () => {
    const { repo } = await setup();
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Vina' } });

    expect((await repo.list('supplier')).map((d) => d.name).sort()).toEqual(['Mekong', 'Vina']);
    expect(await repo.list('ghost')).toEqual([]);
  });

  it('filters by branch', async () => {
    const { repo } = await setup();
    await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.create({ typeKey: 'supplier', branchId: 'branch-2', data: { name: 'Vina' } });

    expect((await repo.list('supplier', { branchId: 'hq' })).map((d) => d.name)).toEqual(['Mekong']);
  });

  it('soft-deletes a record', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.remove('supplier', 's001', created._rev as string);

    expect(await repo.get('supplier', 's001')).toBeNull();
    expect(await repo.list('supplier')).toEqual([]);
  });

  it('surfaces a concurrent modification as a conflict', async () => {
    const { repo } = await setup();
    const created = await repo.create({ typeKey: 'supplier', branchId: 'hq', data: { name: 'Mekong' } });
    await repo.update({
      typeKey: 'supplier',
      id: 's001',
      data: { name: 'A' },
      expectedRev: created._rev as string,
    });

    await expect(
      repo.update({
        typeKey: 'supplier',
        id: 's001',
        data: { name: 'B' },
        expectedRev: created._rev as string,
      }),
    ).rejects.toThrow(/conflict/i);
  });

  it('recomputes formula fields on read and never stores them', async () => {
    const { adapter, registry, repo } = await setup();
    await registry.updateType('supplier', {
      fields: [
        ...supplierFields,
        {
          key: 'score',
          label: { vi: 'Điểm', en: 'Score' },
          dataType: 'formula',
          required: false,
          formula: 'rating * 10',
        },
      ],
    });

    const created = await repo.create({
      typeKey: 'supplier',
      branchId: 'hq',
      data: { name: 'Mekong', rating: 4 },
    });
    expect(created.score).toBe(40);

    const raw = await adapter.get('supplier:s001');
    expect('score' in (raw as unknown as Record<string, unknown>)).toBe(false);
  });
});
