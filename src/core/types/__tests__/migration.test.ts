import { describe, it, expect } from 'vitest';
import { createEnvelope } from '../../db/envelope';
import { createMemoryAdapter } from '../../db/memory-adapter';
import type { TypeDefinition } from '../definition';
import {
  applyTransforms,
  buildChain,
  migrateCollection,
  migrateData,
  migrateRecordOnRead,
  MigrationChainError,
  MigrationError,
  type TypeMigration,
} from '../migration';

describe('applyTransforms — rename', () => {
  it('moves the value to the new key and drops the old one', () => {
    const { data } = applyTransforms({ spicy: 'mild', name: 'Phở' }, [
      { kind: 'rename', from: 'spicy', to: 'spicy_level' },
    ]);
    expect(data).toEqual({ spicy_level: 'mild', name: 'Phở' });
    expect('spicy' in data).toBe(false);
  });

  it('is a no-op when the source field is absent', () => {
    const { data } = applyTransforms({ name: 'Phở' }, [
      { kind: 'rename', from: 'spicy', to: 'spicy_level' },
    ]);
    expect(data).toEqual({ name: 'Phở' });
  });

  it('refuses to overwrite an existing target key', () => {
    expect(() =>
      applyTransforms({ a: 1, b: 2 }, [{ kind: 'rename', from: 'a', to: 'b' }]),
    ).toThrow(MigrationError);
    try {
      applyTransforms({ a: 1, b: 2 }, [{ kind: 'rename', from: 'a', to: 'b' }]);
    } catch (error) {
      expect((error as MigrationError).code).toBe('rename_target_exists');
    }
  });

  it('refuses to touch a reserved system field', () => {
    expect(() =>
      applyTransforms({ branchId: 'hq' }, [{ kind: 'rename', from: 'branchId', to: 'b' }]),
    ).toThrow(/reserved/i);
  });
});

describe('applyTransforms — addDefault', () => {
  it('fills a field that is missing', () => {
    const { data } = applyTransforms({ name: 'Phở' }, [
      { kind: 'addDefault', field: 'spicy_level', value: 'none' },
    ]);
    expect(data).toEqual({ name: 'Phở', spicy_level: 'none' });
  });

  it('never overwrites an existing value', () => {
    const { data } = applyTransforms({ spicy_level: 'hot' }, [
      { kind: 'addDefault', field: 'spicy_level', value: 'none' },
    ]);
    expect(data).toEqual({ spicy_level: 'hot' });
  });
});

describe('applyTransforms — mapValue', () => {
  it('maps known values', () => {
    const { data } = applyTransforms({ level: 'mild' }, [
      { kind: 'mapValue', field: 'level', map: { mild: 1, hot: 2 } },
    ]);
    expect(data).toEqual({ level: 1 });
  });

  it('uses the fallback for an unmapped value', () => {
    const { data } = applyTransforms({ level: 'unknown' }, [
      { kind: 'mapValue', field: 'level', map: { mild: 1 }, fallback: 0 },
    ]);
    expect(data).toEqual({ level: 0 });
  });

  it('throws for an unmapped value when no fallback is declared', () => {
    try {
      applyTransforms({ level: 'unknown' }, [
        { kind: 'mapValue', field: 'level', map: { mild: 1 } },
      ]);
      throw new Error('expected applyTransforms to throw');
    } catch (error) {
      expect((error as MigrationError).code).toBe('unmapped_value');
      expect((error as MigrationError).message).toContain('unknown');
    }
  });

  it('leaves an absent field absent', () => {
    const { data } = applyTransforms({}, [
      { kind: 'mapValue', field: 'level', map: { mild: 1 } },
    ]);
    expect(data).toEqual({});
  });
});

describe('applyTransforms — removeField', () => {
  it('drops the key', () => {
    const { data } = applyTransforms({ old: 1, keep: 2 }, [{ kind: 'removeField', field: 'old' }]);
    expect(data).toEqual({ keep: 2 });
  });
});

describe('applyTransforms — pipeline', () => {
  it('applies transforms in declaration order', () => {
    const { data, applied } = applyTransforms({ a: 1 }, [
      { kind: 'rename', from: 'a', to: 'b' },
      { kind: 'mapValue', field: 'b', map: { 1: 'one' } },
    ]);
    expect(data).toEqual({ b: 'one' });
    expect(applied).toEqual(['rename:a->b', 'mapValue:b']);
  });

  it('does not mutate the input object', () => {
    const input = { a: 1 };
    applyTransforms(input, [{ kind: 'rename', from: 'a', to: 'b' }]);
    expect(input).toEqual({ a: 1 });
  });

  it('reports every transform it ran', () => {
    const { applied } = applyTransforms({ a: 1, b: 2 }, [
      { kind: 'addDefault', field: 'c', value: 3 },
      { kind: 'removeField', field: 'b' },
    ]);
    expect(applied).toEqual(['addDefault:c', 'removeField:b']);
  });

  it('reports nothing for a transform that changed nothing', () => {
    const { data, applied } = applyTransforms({ name: 'Phở' }, [
      { kind: 'rename', from: 'ghost', to: 'spirit' },
      { kind: 'removeField', field: 'ghost' },
      { kind: 'addDefault', field: 'name', value: 'X' },
    ]);
    expect(data).toEqual({ name: 'Phở' });
    expect(applied).toEqual([]);
  });

  it('rejects an unknown transform kind', () => {
    try {
      applyTransforms({ a: 1 }, [{ kind: 'evalCode', source: 'while(true){}' } as never]);
      throw new Error('expected applyTransforms to throw');
    } catch (error) {
      expect((error as MigrationError).code).toBe('unknown_transform');
    }
  });
});

const V1: TypeDefinition = {
  key: 'product',
  kind: 'builtin_ext',
  baseType: 'product',
  name: { vi: 'SP', en: 'Product' },
  version: 1,
  fields: [],
  listView: [],
};
const V2: TypeDefinition = { ...V1, version: 2 };
const V3: TypeDefinition = { ...V1, version: 3 };

/**
 * Bậc version chỉ bump vì field bị xoá khỏi schema — không có transform nào.
 * Đây là thứ `TypeDesigner` phát ra khi admin xoá field: dữ liệu cũ phải còn nguyên.
 */
const REMOVAL_CHAIN: TypeMigration[] = [{ fromVersion: 1, toVersion: 2, transforms: [] }];

const CHAIN: TypeMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    transforms: [{ kind: 'rename', from: 'spicy', to: 'spicy_level' }],
  },
  {
    fromVersion: 2,
    toVersion: 3,
    transforms: [
      { kind: 'mapValue', field: 'spicy_level', map: { mild: 1, hot: 2 }, fallback: 0 },
    ],
  },
];

/**
 * 2→3 **không** có fallback. CHAIN dùng fallback nên `mapValue` không bao giờ ném lỗi;
 * muốn kiểm tra đường lỗi (không ghi khi transform hỏng) thì phải dùng chuỗi này.
 */
const STRICT_CHAIN: TypeMigration[] = [
  {
    fromVersion: 2,
    toVersion: 3,
    transforms: [{ kind: 'mapValue', field: 'spicy_level', map: { mild: 1, hot: 2 } }],
  },
];

/**
 * `DocEnvelope` không khai báo field tuỳ chỉnh của từng type, nên test đọc chúng qua
 * helper này thay vì rải `as unknown as ...` khắp file.
 */
function custom(doc: object): Record<string, unknown> {
  return doc as unknown as Record<string, unknown>;
}

describe('buildChain', () => {
  it('returns the empty chain when already at the target version', () => {
    expect(buildChain(CHAIN, 3, 3)).toEqual([]);
  });

  it('returns the steps in ascending order', () => {
    expect(buildChain(CHAIN, 1, 3).map((step) => `${step.fromVersion}->${step.toVersion}`)).toEqual([
      '1->2',
      '2->3',
    ]);
  });

  it('throws when a step is missing from the registry', () => {
    expect(() => buildChain([CHAIN[0] as TypeMigration], 1, 3)).toThrow(MigrationChainError);
  });

  it('throws when the document is newer than the definition', () => {
    expect(() => buildChain(CHAIN, 4, 3)).toThrow(/newer/i);
  });

  it('names the missing step in the error', () => {
    try {
      buildChain([CHAIN[0] as TypeMigration], 1, 3);
      throw new Error('expected buildChain to throw');
    } catch (error) {
      expect((error as MigrationChainError).message).toContain('2->3');
    }
  });
});

describe('migrateData', () => {
  it('runs every step in order for a document two versions behind', () => {
    const { data, toVersion } = migrateData({ spicy: 'mild', name: 'Phở' }, CHAIN, 1, 3);
    expect(data).toEqual({ spicy_level: 1, name: 'Phở' });
    expect(toVersion).toBe(3);
  });

  it('is idempotent — running the same chain again changes nothing', () => {
    const once = migrateData({ spicy: 'mild' }, CHAIN, 1, 3);
    const twice = migrateData({ ...once.data }, CHAIN, once.toVersion, 3);
    expect(twice.data).toEqual(once.data);
  });

  it('changes nothing when already current', () => {
    const { data, applied } = migrateData({ spicy_level: 1 }, CHAIN, 3, 3);
    expect(data).toEqual({ spicy_level: 1 });
    expect(applied).toEqual([]);
  });

  it('does not mutate the input data', () => {
    const input = { spicy: 'mild' };
    migrateData(input, CHAIN, 1, 3);
    expect(input).toEqual({ spicy: 'mild' });
  });
});

describe('migrateRecordOnRead', () => {
  it('migrates a stale document and writes it back with the new version', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const before = await adapter.get('product:p001');
    const outcome = await migrateRecordOnRead(before!, V3, CHAIN, adapter);

    expect(outcome.migrated).toBe(true);
    expect(outcome.wrote).toBe(true);
    expect(custom(outcome.doc).spicy_level).toBe(1);
    expect(outcome.doc.schemaVersion).toBe(3);

    const stored = await adapter.get('product:p001');
    expect(stored!.schemaVersion).toBe(3);
    expect(custom(stored!).spicy_level).toBe(1);
  });

  it('leaves a current document untouched and does not write', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p002', docType: 'product', branchId: 'hq' }),
      schemaVersion: 3,
      spicy_level: 1,
    } as never);

    const doc = await adapter.get('product:p002');
    const outcome = await migrateRecordOnRead(doc!, V3, CHAIN, adapter);

    expect(outcome.migrated).toBe(false);
    expect(outcome.wrote).toBe(false);
    expect(outcome.doc).toEqual(doc);
  });

  it('preserves record data when a version bump carries no transforms', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p004', docType: 'product', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const before = await adapter.get('product:p004');
    const outcome = await migrateRecordOnRead(before!, V2, REMOVAL_CHAIN, adapter);

    // Xoá field khỏi schema không được xoá giá trị đã ghi. Chuỗi transform rỗng
    // nghĩa là `applied` rỗng, nên không có gì được ghi và dữ liệu cũ còn nguyên.
    expect(outcome.migrated).toBe(false);
    expect(outcome.wrote).toBe(false);
    expect(custom(outcome.doc).spicy).toBe('mild');

    const stored = await adapter.get('product:p004');
    expect(custom(stored!).spicy).toBe('mild');
    expect(stored!.schemaVersion).toBe(1);
  });

  it('does not write when a transform fails, and surfaces the error', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p003', docType: 'product', branchId: 'hq' }),
      schemaVersion: 2,
      spicy_level: 'not-in-the-map',
    } as never);

    const doc = await adapter.get('product:p003');
    await expect(migrateRecordOnRead(doc!, V3, STRICT_CHAIN, adapter)).rejects.toThrow(
      /not-in-the-map/,
    );

    const stored = await adapter.get('product:p003');
    expect(stored!.schemaVersion).toBe(2);
  });

  it('bumps updatedAt when it writes', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({
        id: 'product:p004',
        docType: 'product',
        branchId: 'hq',
        now: '2020-01-01T00:00:00.000Z',
      }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const doc = await adapter.get('product:p004');
    const outcome = await migrateRecordOnRead(doc!, V3, CHAIN, adapter);

    expect(outcome.doc.updatedAt).not.toBe('2020-01-01T00:00:00.000Z');
    expect(outcome.doc.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('migrateCollection', () => {
  it('migrates only documents of the given type', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:p001', docType: 'product', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);
    await adapter.put({
      ...createEnvelope({ id: 'order:o001', docType: 'order', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const progress = await migrateCollection(adapter, V3, CHAIN);

    expect(progress.migrated).toBe(1);
    expect((await adapter.get('product:p001'))!.schemaVersion).toBe(3);
    expect((await adapter.get('order:o001'))!.schemaVersion).toBe(1);
  });

  it('reports progress as it scans', async () => {
    const adapter = await createMemoryAdapter();
    for (let i = 0; i < 3; i += 1) {
      await adapter.put({
        ...createEnvelope({ id: `product:p00${i}`, docType: 'product', branchId: 'hq' }),
        schemaVersion: 1,
        spicy: 'mild',
      } as never);
    }

    const seen: number[] = [];
    await migrateCollection(adapter, V3, CHAIN, (p) => seen.push(p.migrated));

    expect(seen.at(-1)).toBe(3);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('keeps going when one document fails, and counts it', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:good', docType: 'product', branchId: 'hq' }),
      schemaVersion: 2,
      spicy_level: 'mild',
    } as never);
    await adapter.put({
      ...createEnvelope({ id: 'product:bad', docType: 'product', branchId: 'hq' }),
      schemaVersion: 2,
      spicy_level: 'nope',
    } as never);

    const progress = await migrateCollection(adapter, V3, STRICT_CHAIN);

    expect(progress.migrated).toBe(1);
    expect(progress.failed).toBe(1);
    expect((await adapter.get('product:good'))!.schemaVersion).toBe(3);
    expect((await adapter.get('product:bad'))!.schemaVersion).toBe(2);
  });

  it('reports total as the number of matching documents', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'product:a', docType: 'product', branchId: 'hq' }),
      schemaVersion: 3,
      spicy_level: 1,
    } as never);
    await adapter.put({
      ...createEnvelope({ id: 'product:b', docType: 'product', branchId: 'hq' }),
      schemaVersion: 1,
      spicy: 'mild',
    } as never);

    const progress = await migrateCollection(adapter, V3, CHAIN);

    expect(progress.total).toBe(2);
    expect(progress.scanned).toBe(2);
    expect(progress.migrated).toBe(1);
    expect(progress.failed).toBe(0);
  });

  it('matches a new entity type by its own key', async () => {
    const adapter = await createMemoryAdapter();
    await adapter.put({
      ...createEnvelope({ id: 'supplier:s1', docType: 'supplier', branchId: 'hq' }),
      schemaVersion: 2,
      spicy_level: 'hot',
    } as never);

    const entity: TypeDefinition = {
      key: 'supplier',
      kind: 'entity',
      baseType: null,
      name: { vi: 'NCC', en: 'Supplier' },
      version: 3,
      fields: [],
      listView: [],
    };

    const progress = await migrateCollection(adapter, entity, CHAIN);

    expect(progress.total).toBe(1);
    expect(custom((await adapter.get('supplier:s1'))!).spicy_level).toBe(2);
  });
});
